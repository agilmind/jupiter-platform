import * as path from 'path';
import { SimpleGit, simpleGit } from "simple-git";
import { logger } from '@nx/devkit';
import * as fs from 'fs-extra';
import { execSync } from 'child_process';

/**
 * Clase base que maneja operaciones Git para generadores de proyectos.
 */
export class Git {
    dirApp: string;
    genBranch: string;
    developerBranch: string;
    mainBranch: string;
    git: SimpleGit;

    constructor(
      appDir: string,
      generatorBranch = "base",
      developerBranch = "develop",
      mainBranch = "main") {
        this.dirApp = appDir;
        this.genBranch = generatorBranch;
        this.developerBranch = developerBranch;
        this.mainBranch = mainBranch;
        this.git = simpleGit(this.dirApp);
    }

    // async init(projectName: string) {
    //   await this.git.init();
    //   await this.git.checkout(["-b", this.mainBranch]);
    //   await fs.writeFile(
    //     path.join(this.dirApp, `${this.mainBranch}.json`),
    //     `{"projectName": "${projectName}"}`
    //   );
    //   await this.git.add("./*");
    //   await this.git.commit("initial");
    //
    //   await this.git.checkout(["-b", this.developerBranch]);
    //   await fs.writeFile(
    //     path.join(this.dirApp, `${this.developerBranch}.json`),
    //     `{"projectName": "${projectName}"}`
    //   );
    //   await this.git.add("./*");
    //   await this.git.commit("initial");
    //
    //   await this.git.checkout(["-b", this.genBranch]);
    //   await fs.writeFile(
    //     path.join(this.dirApp, `${this.genBranch}.json`),
    //     `{"projectName": "${projectName}"}`
    //   );
    //   await this.git.add("./*");
    //   await this.git.commit("initial");
    // }

    async prepareForGeneration() {
        const files = await this.hasPendingCommits(this.developerBranch);
        if (files.length === 0) {
            await this.git.checkout(this.genBranch);
            await this.git.rm(["-r", "./*"]);
        } else {
            const filesStr = files.map(x=>x.path).join("\n");
            throw Error(`${this.developerBranch} has pending commits\n${filesStr}`)
        }
    }

    async revertPrepareForGeneration() {
        await this.git.reset(["--hard", "HEAD"]);
    }

    async addAndCommit(message: string) {
        await this.git.add("./*");
        await this.git.commit(message);
    }

    async getLastMessage() {
        const message = await this.git.log(["-1", "--pretty=%B"]);
        return message && message.latest ? message.latest.hash : "base changes";
    }

    async hasPendingCommits(branchName: string) {
        await this.git.checkout(branchName);
        const status = await this.git.status();
        return status.files;
    }

    async patchToDevelop() {
        await this.git.checkout(this.genBranch);
        const fileName = await this.git.raw("format-patch", "-n", "HEAD^");
        const patchFilePath = path.join(this.dirApp, fileName.trim());
        await this.git.checkout(this.developerBranch);
        await this.git.applyPatch([patchFilePath], ["--ignore-space-change", "--ignore-whitespace", '--verbose']);

        // Limpiar el archivo de parche después de aplicarlo
        if (fs.existsSync(patchFilePath)) {
          fs.unlinkSync(patchFilePath);
        }

        return true;
    }

    async rebaseToDevelop() {
        await this.git.checkout(this.developerBranch);
        await this.git.rebase([this.genBranch]);
        return true;
    }
}

/**
 * Extensión para trabajar con proyectos específicos dentro de un monorepo Nx
 */
export class NxProjectGit {
  rootGit: Git;
  projectDir: string;
  absoluteProjectPath: string;

  constructor(rootPath: string, projectDir: string) {
    this.rootGit = new Git(rootPath);
    this.projectDir = projectDir;
    this.absoluteProjectPath = path.join(rootPath, projectDir);
  }

  /**
   * devuelve el nombre del branch actual
   */
  async getCurrentBranch() {
    return await this.rootGit.git.revparse(['--abbrev-ref', 'HEAD']);
  }

  /**
   * Asegura que existan las ramas base y develop
   */
  async ensureBranches() {
    const branches = await this.rootGit.git.branch();

    // Guardar el branch actual
    const currentBranch = await this.getCurrentBranch();

    // Verificar y crear branch base si no existe
    if (!branches.all.includes('base')) {
      await this.rootGit.git.checkout(['-b', 'base']);
      await this.rootGit.git.checkout(currentBranch);
    }

    // Verificar y crear branch develop si no existe
    if (!branches.all.includes('develop')) {
      await this.rootGit.git.checkout(['-b', 'develop']);
      await this.rootGit.git.checkout(currentBranch);
    }
  }

  /**
   * Preparar el directorio del proyecto específico para generación
   */
  async prepareForGeneration() {
    try {
      // PASO 1: Eliminar físicamente los archivos generados por Nx en la rama actual
      if (fs.existsSync(this.absoluteProjectPath)) {
        logger.info(`Removing Nx-generated files from current branch before checkout...`);
        fs.removeSync(this.absoluteProjectPath);
        logger.info(`Files removed successfully`);
      }

      // PASO 2: Cambiar a la rama base
      await this.rootGit.git.checkout('base');
      logger.info('Switched to base branch');

      // PASO 3: Asegurarse de que el directorio existe en base
      fs.ensureDirSync(this.absoluteProjectPath);

      // PASO 4: Eliminar archivos existentes en base con git rm (si hay)
      try {
        logger.info(`Removing existing files from base branch...`);
        await this.rootGit.git.rm(['-r', `${this.projectDir}/*`]);
        logger.info(`Project directory cleaned in base branch`);
      } catch (rmError) {
        // Si el error es por archivos inexistentes (primer uso), lo ignoramos
        if (rmError.message && rmError.message.includes('did not match any files')) {
          logger.info(`No files found to remove in base branch`);
        } else {
          throw rmError;
        }
      }

      // Ahora estamos en la rama base con el directorio limpio
      logger.info(`Ready for file generation in base branch`);
    } catch (error) {
      logger.error(`Failed to prepare project directory: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Revertir cambios a HEAD
   */
  async revertPrepareForGeneration() {
    await this.rootGit.git.reset(['--hard', 'HEAD']);
  }

  /**
   * Añadir y commitear cambios específicos del proyecto
   */
  async addAndCommit(message: string) {
    try {
      // Cambiamos al directorio del proyecto para asegurarnos de estar en el contexto correcto
      logger.info(`Adding changes in ${this.projectDir}`);

      // Verificar qué archivos están en el directorio del proyecto
      const projectFiles = await this.listAllProjectFiles();
      logger.info(`Found ${projectFiles.length} files in project directory`);

      // Añadir todos los archivos del proyecto explícitamente
      await this.rootGit.git.add([this.projectDir]);

      // Verificación adicional para files específicos que puedan estar dando problemas
      const criticalFiles = [
        path.join(this.projectDir, 'project.json'),
        path.join(this.projectDir, 'tsconfig.json'),
        path.join(this.projectDir, 'tsconfig.app.json')
      ];

      for (const file of criticalFiles) {
        if (fs.existsSync(file)) {
          // Forzar add explícito de estos archivos
          await this.rootGit.git.add([file]);
          logger.info(`Explicitly added: ${file}`);
        }
      }

      // Verificar si hay cambios para commit
      const status = await this.rootGit.git.status();

      // Registrar qué archivos están pendientes para commit
      if (status.files.length > 0) {
        logger.info(`Files to be committed: ${status.files.map(f => f.path).join(', ')}`);
        await this.rootGit.git.commit(message);
        logger.info(`Changes committed: ${message}`);
      } else {
        logger.info('No changes to commit');
      }

      // Verificar después del commit si quedaron archivos sin commitear
      const postStatus = await this.rootGit.git.status();
      if (postStatus.files.length > 0) {
        logger.warn(`WARNING: Some files were not committed: ${postStatus.files.map(f => f.path).join(', ')}`);

        // Intento adicional para commitear archivos restantes
        await this.rootGit.git.add([this.projectDir]);
        await this.rootGit.git.commit(`${message} (additional files)`);
      }
    } catch (error) {
      logger.error(`Failed to add and commit changes: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Lista todos los archivos en el directorio del proyecto
   */
  private async listAllProjectFiles(): Promise<string[]> {
    const files: string[] = [];

    // Función recursiva para listar archivos
    const listFilesRecursively = (dir: string) => {
      if (!fs.existsSync(dir)) return;

      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== '.git' && entry.name !== 'node_modules') {
            listFilesRecursively(fullPath);
          }
        } else {
          files.push(fullPath);
        }
      }
    };

    listFilesRecursively(this.absoluteProjectPath);
    return files;
  }

  /**
   * Rebase a develop
   */
  async rebaseToDevelop() {
    try {
      // Cambiar a develop y hacer rebase
      await this.rootGit.git.checkout('develop');
      logger.info('Switched to develop branch');

      try {
        // Intentar rebase
        await this.rootGit.git.rebase(['base']);
        logger.info('Successfully rebased develop on base');
        return true; // Rebase exitoso
      } catch (rebaseError) {
        // Si hay conflicto, manejarlo
        if (rebaseError.message.includes('CONFLICT') || rebaseError.message.includes('conflict')) {
          logger.warn('Rebase conflict detected!');
          logger.info(`
==========================================================================
CONFLICTO DE REBASE DETECTADO

Se ha detectado un conflicto durante el rebase de 'base' a 'develop'.
Para resolver este conflicto, sigue estos pasos:

1. Resuelve los conflictos manualmente en los archivos indicados arriba
   - Puedes usar tu editor o IDE para resolver los conflictos
   - Busca las marcas <<<<<<< HEAD, =======, y >>>>>>> para identificarlos

2. Una vez resueltos, marca los archivos como resueltos:
   $ git add [archivos_con_conflictos]

3. Continúa el rebase:
   $ git rebase --continue

4. Si deseas abortar el rebase:
   $ git rebase --abort

NOTA: Se ha generado un archivo de parche en la raíz del proyecto
que puede ser útil para resolver manualmente los conflictos.
==========================================================================
`);

          // Crear un patch para ayudar a resolver manualmente
          try {
            const patchFilePath = path.join(process.cwd(), `${path.basename(this.projectDir)}-conflict-resolution.patch`);
            const diffOutput = await this.rootGit.git.diff(['base', 'HEAD']);
            fs.writeFileSync(patchFilePath, diffOutput);
            logger.info(`Patch file created at: ${patchFilePath}`);
          } catch (patchError) {
            logger.warn(`Could not create patch file: ${patchError.message}`);
          }

          // No arrojamos una excepción - simplemente retornamos false para indicar que hay conflicto
          return false;
        } else {
          // Si es otro tipo de error, lanzarlo
          throw rebaseError;
        }
      }
    } catch (error) {
      logger.error(`Rebase failed: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
 * Aplicar cambios como parche a develop con mejor tolerancia a modificaciones previas
 */
async patchToDevelop() {
  try {
    // 1. Crear un directorio temporal para el respaldo de develop
    const tempBackupDir = path.join(process.cwd(), '.temp-backup');
    if (fs.existsSync(tempBackupDir)) {
      fs.removeSync(tempBackupDir);
    }
    fs.mkdirSync(tempBackupDir);

    // 2. Crear el parche desde branch base
    await this.rootGit.git.checkout('base');
    logger.info('Switched to base branch to create changes list');

    // 3. Obtener la lista de archivos modificados (respecto al commit anterior)
    const diffSummary = await this.rootGit.git.diff(['--name-status', 'HEAD~1', 'HEAD']);
    const changedFiles = diffSummary.split('\n')
      .filter(line => line.trim().length > 0)
      .map(line => {
        const [status, file] = line.trim().split(/\s+/);
        return { status, file };
      })
      .filter(change => change.file.startsWith(this.projectDir));

    logger.info(`Detected ${changedFiles.length} changed files in base`);

    // 4. Cambiar a develop para preparar la aplicación de cambios
    await this.rootGit.git.checkout('develop');
    logger.info('Switched to develop branch');

    // 5. Hacer backup de los archivos en develop antes de modificarlos
    for (const change of changedFiles) {
      const srcPath = change.file;
      const backupPath = path.join(tempBackupDir, srcPath);

      // Crear el directorio padre si no existe
      fs.mkdirSync(path.dirname(backupPath), { recursive: true });

      // Copiar el archivo a backup si existe
      if (fs.existsSync(srcPath)) {
        fs.copyFileSync(srcPath, backupPath);
        logger.info(`Backed up: ${srcPath}`);
      }
    }

    // 6. Crear parche para resolver conflictos manualmente (si es necesario)
    const manualPatchPath = path.join(process.cwd(), `${path.basename(this.projectDir)}-manual.patch`);
    const patchContent = await this.rootGit.git.diff(['base', 'develop', '--', this.projectDir]);
    fs.writeFileSync(manualPatchPath, patchContent);
    logger.info(`Manual resolution patch created: ${manualPatchPath}`);

    // 7. Sincronizar archivos de base a develop con estrategia inteligente
    let hasConflicts = false;
    const conflictingFiles = [];

    for (const change of changedFiles) {
      try {
        const srcPath = change.file;
        const basePath = path.join(process.cwd(), srcPath);
        const developPath = path.join(process.cwd(), srcPath);
        const backupPath = path.join(tempBackupDir, srcPath);

        // Si es un archivo nuevo (no existe backup), simplemente copiarlo
        if (change.status === 'A' || !fs.existsSync(backupPath)) {
          // Asegurar que el directorio existe
          fs.mkdirSync(path.dirname(developPath), { recursive: true });

          // Copiar el nuevo archivo de base a develop
          fs.copyFileSync(basePath, developPath);
          logger.info(`Added new file: ${srcPath}`);
          continue;
        }

        // Para archivos existentes, intentar estrategia de merge inteligente
        // 1. Intentar usar diff3 para merge de 3 vías
        try {
          // Crear archivos temporales para el merge
          const baseContentPath = path.join(tempBackupDir, `${path.basename(srcPath)}.base`);
          const developContentPath = path.join(tempBackupDir, `${path.basename(srcPath)}.develop`);
          const baseContent = fs.readFileSync(basePath, 'utf8');
          const developContent = fs.readFileSync(developPath, 'utf8');

          // Obtener el contenido original (del commit previo en base)
          await this.rootGit.git.checkout(['base~1', '--', srcPath]);
          const originalContent = fs.existsSync(srcPath) ? fs.readFileSync(srcPath, 'utf8') : '';

          // Volver a develop
          await this.rootGit.git.checkout(['develop']);

          // Escribir contenidos a archivos temporales
          fs.writeFileSync(baseContentPath, originalContent);
          fs.writeFileSync(developContentPath, developContent);

          // Intentar merge de 3 vías usando la herramienta diff3
          const mergeCommand = `diff3 -m "${developContentPath}" "${baseContentPath}" "${basePath}" > "${developPath}.merged"`;
          try {
            execSync(mergeCommand, { stdio: 'pipe' });

            // Verificar si hay marcadores de conflicto en el archivo merged
            const mergedContent = fs.readFileSync(`${developPath}.merged`, 'utf8');
            if (mergedContent.includes('<<<<<<<') || mergedContent.includes('=======')) {
              // Hay conflictos, registrarlo pero guardar el resultado
              hasConflicts = true;
              conflictingFiles.push(srcPath);
              logger.warn(`Conflicts detected in: ${srcPath}`);

              // Renombrar el archivo original antes de reemplazarlo
              fs.renameSync(developPath, `${developPath}.orig`);
            }

            // Mover el archivo merged a la ubicación final
            fs.renameSync(`${developPath}.merged`, developPath);
            logger.info(`Merged changes in: ${srcPath}`);
          } catch (mergeError) {
            // Si diff3 falla, caer al enfoque de copia + advertencia
            hasConflicts = true;
            conflictingFiles.push(srcPath);
            fs.copyFileSync(basePath, `${developPath}.base`);
            logger.warn(`Failed to auto-merge: ${srcPath}`);
          }
        } catch (mergeError) {
          // Si algo falla en el proceso de merge, registrar el conflicto
          hasConflicts = true;
          conflictingFiles.push(srcPath);
          logger.warn(`Merge process failed for: ${srcPath} - ${mergeError.message}`);
        }
      } catch (fileError) {
        logger.error(`Error processing file ${change.file}: ${fileError.message}`);
        hasConflicts = true;
        conflictingFiles.push(change.file);
      }
    }

    // 8. Añadir todos los cambios al staging
    await this.rootGit.git.add([this.projectDir]);

    // 9. Verificar si hay archivos en staging (cambios pendientes)
    const status = await this.rootGit.git.status();

    if (status.files.length > 0) {
      // Hay cambios para commitear
      await this.rootGit.git.commit(`Sync changes from base to develop for ${path.basename(this.projectDir)}`);
      logger.info('Committed synchronized changes to develop branch');
    } else {
      logger.info('No changes to commit after synchronization');
    }

    // 10. Limpiar directorio temporal
    fs.removeSync(tempBackupDir);

    // 11. Mostrar mensaje adecuado si hubo conflictos
    if (hasConflicts) {
      logger.warn(`
==========================================================================
⚠️ ATENCIÓN: CAMBIOS SINCRONIZADOS CON POSIBLES CONFLICTOS

Se han sincronizado los archivos de "base" a "develop", pero se detectaron
potenciales conflictos en los siguientes archivos:
${conflictingFiles.map(f => `- ${f}`).join('\n')}

Para cada archivo con conflicto:
1. Revisa los archivos con extensión .orig (respaldo del original) y .base (versión de base)
2. Verifica que los cambios se hayan integrado correctamente
3. Si necesitas ayuda adicional, consulta el parche manual en: ${manualPatchPath}

Los cambios ya han sido commiteados, pero puedes hacer ajustes adicionales
y luego hacer commit con:
$ git add [archivos_modificados]
$ git commit --amend
==========================================================================`);

      return false; // Indicar que hubo conflictos
    }

    return true; // Todo fue sincronizado exitosamente
  } catch (error) {
    logger.error(`Patch process failed: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

  /**
   * Encuentra archivos .rej (rechazados durante la aplicación de un parche)
   */
  private async findRejFiles(): Promise<string[]> {
    const rejFiles: string[] = [];

    const findRejInDir = (dir: string) => {
      if (!fs.existsSync(dir)) return;

      const items = fs.readdirSync(dir);
      for (const item of items) {
        const itemPath = path.join(dir, item);

        if (fs.lstatSync(itemPath).isDirectory()) {
          findRejInDir(itemPath);
        } else if (item.endsWith('.rej')) {
          rejFiles.push(itemPath);
        }
      }
    };

    findRejInDir(this.absoluteProjectPath);
    return rejFiles;
  }
}
