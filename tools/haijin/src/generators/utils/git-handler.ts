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
 * Aplicar cambios como parche a develop garantizando que todos los cambios de base se transfieran
 */
async patchToDevelop() {
  try {
    // 1. Crear un directorio temporal para el respaldo y trabajo
    const tempDir = path.join(process.cwd(), '.temp-sync');
    if (fs.existsSync(tempDir)) {
      fs.removeSync(tempDir);
    }
    fs.mkdirSync(tempDir);

    // 2. Obtener el branch actual y cambiar a base
    const currentBranch = await this.getCurrentBranch();
    await this.rootGit.git.checkout('base');
    logger.info('Switched to base branch to prepare files for sync');

    // 3. Identificar todos los archivos en el directorio del proyecto en base
    const projectFiles = this.listFilesInDir(this.projectDir);
    logger.info(`Found ${projectFiles.length} files in base branch under ${this.projectDir}`);

    // 4. Guardar la versión actual de los archivos en base
    for (const filePath of projectFiles) {
      const content = fs.readFileSync(filePath, 'utf8');
      const relativePath = path.relative(process.cwd(), filePath);
      const backupPath = path.join(tempDir, 'base', relativePath);

      fs.mkdirSync(path.dirname(backupPath), { recursive: true });
      fs.writeFileSync(backupPath, content);
    }
    logger.info(`Backed up all base files to ${path.join(tempDir, 'base')}`);

    // 5. Cambiar a develop
    await this.rootGit.git.checkout('develop');
    logger.info('Switched to develop branch');

    // 6. Guardar la versión actual de los archivos en develop (si existen)
    for (const filePath of projectFiles) {
      const relativePath = path.relative(process.cwd(), filePath);
      const developPath = path.join(process.cwd(), relativePath);
      const backupPath = path.join(tempDir, 'develop', relativePath);

      if (fs.existsSync(developPath)) {
        const content = fs.readFileSync(developPath, 'utf8');
        fs.mkdirSync(path.dirname(backupPath), { recursive: true });
        fs.writeFileSync(backupPath, content);
      }
    }
    logger.info(`Backed up develop files to ${path.join(tempDir, 'develop')}`);

    // 7. Determinar la estrategia para cada archivo
    let hasConflicts = false;
    const conflicts = [];

    for (const filePath of projectFiles) {
      const relativePath = path.relative(process.cwd(), filePath);
      const developPath = path.join(process.cwd(), relativePath);
      const basePath = path.join(tempDir, 'base', relativePath);
      const developBackupPath = path.join(tempDir, 'develop', relativePath);

      // Crear directorios necesarios
      fs.mkdirSync(path.dirname(developPath), { recursive: true });

      // ESTRATEGIA:
      // 1. Si el archivo no existe en develop, simplemente copiarlo de base
      // 2. Si existe, usar el algoritmo de diff y merge para combinar cambios

      if (!fs.existsSync(developBackupPath)) {
        // Archivo no existe en develop, copiarlo directamente
        fs.copyFileSync(basePath, developPath);
        logger.info(`Added new file from base: ${relativePath}`);
      } else {
        // Archivo existe en develop - necesitamos combinar cambios
        const baseContent = fs.readFileSync(basePath, 'utf8');
        const developContent = fs.readFileSync(developBackupPath, 'utf8');

        if (baseContent === developContent) {
          // No hay diferencias, simplemente continuar
          logger.info(`No changes needed for: ${relativePath}`);
          continue;
        }

        // Crear archivos temporales para el merge
        const baseFile = path.join(tempDir, 'merge', 'base.txt');
        const developFile = path.join(tempDir, 'merge', 'develop.txt');
        const resultFile = path.join(tempDir, 'merge', 'result.txt');

        fs.mkdirSync(path.dirname(baseFile), { recursive: true });
        fs.writeFileSync(baseFile, baseContent);
        fs.writeFileSync(developFile, developContent);

        // IMPORTANTE: Priorizar cambios de base pero intentar preservar cambios de develop
        try {
          // Crear un "parche" en formato diff que capture los cambios del desarrollador
          try {
            // Usar diff para crear un parche de los cambios del desarrollador
            const tmpDiffFile = path.join(tempDir, 'dev-changes.patch');

            // 1. Buscar la última versión común entre base y develop
            // (Para esto, podríamos necesitar un proceso más sofisticado, pero una aproximación sería:)
            // - Buscar el último commit en base que afectó este archivo
            // - Ver ese mismo archivo en develop en ese momento

            // Simplificación: Asumimos que los cambios del desarrollador son todas las diferencias
            // entre la versión previa en base y la versión actual en develop

            // Crear un parche con los cambios del desarrollador
            const diffCmd = `diff -u "${baseFile}" "${developFile}" > "${tmpDiffFile}" || true`;
            execSync(diffCmd, { stdio: 'pipe' });

            // 2. Aplicar primero la versión de base (esto asegura que todos los cambios de base están presentes)
            fs.copyFileSync(baseFile, resultFile);

            // 3. Intentar aplicar los cambios del desarrollador encima
            try {
              const patchCmd = `patch -f "${resultFile}" < "${tmpDiffFile}" || true`;
              execSync(patchCmd, { stdio: 'pipe' });

              // 4. Verificar que el resultado tenga los cambios de ambos
              const resultContent = fs.readFileSync(resultFile, 'utf8');

              // Verificar si hay marcadores de conflicto en el resultado
              if (resultContent.includes('<<<<<<<') || resultContent.includes('=======')) {
                hasConflicts = true;
                conflicts.push(relativePath);
                logger.warn(`Conflict markers found in: ${relativePath}`);
              }

              // Escribir el resultado final a develop
              fs.writeFileSync(developPath, resultContent);
              logger.info(`Merged changes successfully for: ${relativePath}`);
            } catch (patchError) {
              // Si falló el patch, hacer una solución más directa
              logger.warn(`Failed to patch cleanly: ${relativePath} - ${patchError.message}`);

              // PRIORIDAD ABSOLUTA: No perder los cambios de base
              // Copiar la versión de base pero guardar la de develop como backup
              fs.copyFileSync(baseFile, developPath);
              const conflictBackupPath = `${developPath}.develop-changes`;
              fs.copyFileSync(developFile, conflictBackupPath);

              hasConflicts = true;
              conflicts.push(relativePath);
              logger.warn(`Used base version for ${relativePath}, developer changes saved to ${conflictBackupPath}`);
            }
          } catch (diffError) {
            logger.warn(`Failed to create diff: ${relativePath} - ${diffError.message}`);

            // Como fallback, usar diff3 (merge de 3 vías) si está disponible
            try {
              // Necesitamos una versión "original" común - usamos una aproximación
              const ancestorFile = path.join(tempDir, 'merge', 'ancestor.txt');
              // Escribimos un archivo vacío o una aproximación
              fs.writeFileSync(ancestorFile, '');

              const diff3Cmd = `diff3 -m "${developFile}" "${ancestorFile}" "${baseFile}" > "${resultFile}" || true`;
              execSync(diff3Cmd, { stdio: 'pipe' });

              const resultContent = fs.readFileSync(resultFile, 'utf8');
              fs.writeFileSync(developPath, resultContent);

              if (resultContent.includes('<<<<<<<')) {
                hasConflicts = true;
                conflicts.push(relativePath);
              }

              logger.info(`Used diff3 for: ${relativePath}`);
            } catch (diff3Error) {
              // Si todo falla, priorizar base pero guardar develop
              fs.copyFileSync(baseFile, developPath);
              const conflictBackupPath = `${developPath}.develop-changes`;
              fs.copyFileSync(developFile, conflictBackupPath);

              hasConflicts = true;
              conflicts.push(relativePath);
              logger.warn(`Used base version for ${relativePath}, developer changes saved to ${conflictBackupPath}`);
            }
          }
        } catch (mergeError) {
          // En caso de cualquier error en el proceso, priorizar base
          logger.error(`Merge error for ${relativePath}: ${mergeError.message}`);
          fs.copyFileSync(baseFile, developPath);

          const conflictBackupPath = `${developPath}.develop-changes`;
          fs.copyFileSync(developFile, conflictBackupPath);

          hasConflicts = true;
          conflicts.push(relativePath);
        }
      }
    }

    // 8. Crear un parche general para referencia
    const manualPatchPath = path.join(process.cwd(), `${path.basename(this.projectDir)}-manual.patch`);
    await this.rootGit.git.checkout('base');
    const diffOutput = await this.rootGit.git.diff(['HEAD', 'develop', '--', this.projectDir]);
    fs.writeFileSync(manualPatchPath, diffOutput);

    // 9. Volver a develop y hacer commit
    await this.rootGit.git.checkout('develop');

    // 10. Verificar si hay cambios para commit
    const status = await this.rootGit.git.status();
    if (status.files.length > 0) {
      // Añadir todos los cambios
      await this.rootGit.git.add([this.projectDir]);

      // Hacer commit
      await this.rootGit.git.commit(`Sync changes from base to develop for ${path.basename(this.projectDir)}`);
      logger.info('Committed synchronized changes to develop branch');
    } else {
      logger.info('No changes to commit after synchronization');
    }

    // 11. Limpiar directorio temporal
    fs.removeSync(tempDir);

    // 12. Mostrar mensaje apropiado si hubo conflictos
    if (hasConflicts) {
      logger.warn(`
==========================================================================
⚠️ ATENCIÓN: CAMBIOS SINCRONIZADOS CON POSIBLES CONFLICTOS

Se han sincronizado los archivos de "base" a "develop", pero se detectaron
conflictos o diferencias significativas en los siguientes archivos:
${conflicts.map(f => `- ${f}`).join('\n')}

Para cada archivo con conflicto, se han seguido estas reglas:
1. TODOS los cambios de base están garantizados en develop
2. Los cambios del desarrollador se han preservado cuando ha sido posible
3. Para archivos donde fue necesario priorizar base, se ha guardado una
   copia de los cambios del desarrollador con extensión .develop-changes

Los cambios ya han sido commiteados. Revise los archivos mencionados y
realice ajustes adicionales si es necesario.

Para referencia, un parche completo está disponible en: ${manualPatchPath}
==========================================================================`);

      return false; // Indicar que hubo conflictos
    }

    return true; // Todo sincronizado correctamente
  } catch (error) {
    logger.error(`Patch process failed: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

/**
 * Lista todos los archivos en un directorio recursivamente
 */
private listFilesInDir(dirPath: string): string[] {
  const files: string[] = [];

  if (!fs.existsSync(dirPath)) {
    return files;
  }

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      if (entry.name !== '.git' && entry.name !== 'node_modules') {
        files.push(...this.listFilesInDir(fullPath));
      }
    } else {
      files.push(fullPath);
    }
  }

  return files;
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
