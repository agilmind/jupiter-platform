import { Git } from './gitShell';
import * as path from 'path';
import { logger } from '@nx/devkit';
import { execSync } from 'child_process';
import * as fs from 'fs-extra';

/**
 * Extensión segura de Git para trabajar con proyectos específicos dentro de un monorepo
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
   * Preparar el directorio del proyecto específico para generación
   */
  async prepareForGeneration() {
    try {
      // PASO 1: Eliminar físicamente los archivos generados por Nx en la rama actual
      // para poder cambiar a la rama base sin conflictos
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
      // Nx copiará los archivos del árbol virtual al sistema de archivos
      logger.info(`Ready for file generation in base branch`);
    } catch (error) {
      logger.error(`Failed to prepare project directory: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Revertir la preparación en caso de error
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
      // En lugar de usar un patrón, añadir el directorio completo
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
   * Aplicar cambios como parche a develop
   */
  async patchToDevelop() {
    try {
      // Crear el parche desde branch base
      await this.rootGit.git.checkout('base');
      logger.info('Switched to base branch to create patch');

      // Crear y aplicar el parche
      let patchFilePath;
      try {
        // Intentar con format-patch primero
        const fileName = await this.rootGit.git.raw('format-patch', '-1', 'HEAD');
        patchFilePath = path.join(process.cwd(), fileName.trim());
        logger.info(`Created patch file: ${patchFilePath}`);
      } catch (formatError) {
        logger.warn(`Failed to create patch with format-patch: ${formatError.message}`);

        // Enfoque alternativo: usar diff
        const diffOutput = await this.rootGit.git.diff(['HEAD~1', 'HEAD']);
        patchFilePath = path.join(process.cwd(), `${path.basename(this.projectDir)}.patch`);
        fs.writeFileSync(patchFilePath, diffOutput);
        logger.info(`Created patch file using diff: ${patchFilePath}`);
      }

      // Cambiar a develop
      await this.rootGit.git.checkout('develop');
      logger.info('Switched to develop branch');

      try {
        // Aplicar el parche con opciones extendidas
        await this.rootGit.git.applyPatch([patchFilePath], [
          '--ignore-space-change',
          '--ignore-whitespace',
          '--reject',  // Permite aplicar parcialmente el parche, rechazando partes problemáticas
          '--whitespace=fix'  // Arregla problemas de espacios en blanco
        ]);
        logger.info('Patch applied successfully to develop branch');

        // Verificar si hay archivos .rej (rechazados por conflictos)
        const rejFiles = await this.findRejFiles();
        if (rejFiles.length > 0) {
          // Hay archivos rechazados, hay conflictos
          logger.warn(`
==========================================================================
CONFLICTO EN APLICACIÓN DE PARCHE DETECTADO

Se detectaron conflictos al aplicar el parche a la rama develop.
Los siguientes archivos tuvieron conflictos:
${rejFiles.map(f => `- ${f}`).join('\n')}

Para cada archivo con conflicto:
1. Edita el archivo original para incorporar los cambios rechazados
   - Cada archivo rechazado está en formato .rej con el mismo nombre base
   - Compara el archivo .rej con el original y combínalos manualmente

2. Una vez resueltos todos los conflictos, añade los cambios:
   $ git add [archivos_modificados]

3. Haz commit de los cambios:
   $ git commit -m "Resueltos conflictos de parche"

El parche original queda guardado en: ${patchFilePath}
==========================================================================`);

          // Retornamos false para indicar que hay conflictos
          return false;
        }

        // Añadir y commitear todos los cambios
        await this.rootGit.git.add([this.projectDir]);
        await this.rootGit.git.commit(`Apply patch from base to develop: ${path.basename(this.projectDir)}`);
        logger.info('Committed patched changes to develop branch');

        // Limpiar el archivo de parche después de aplicarlo
        if (fs.existsSync(patchFilePath)) {
          fs.unlinkSync(patchFilePath);
          logger.info('Deleted patch file after applying');
        }

        return true; // Patch aplicado con éxito
      } catch (applyError) {
        logger.error(`Error applying patch: ${applyError.message}`);

        // Guardar una copia del parche para referencia
        const backupPatchPath = path.join(process.cwd(), `${path.basename(this.projectDir)}-manual-patch.patch`);
        fs.copyFileSync(patchFilePath, backupPatchPath);

        logger.warn(`
==========================================================================
ERROR AL APLICAR PARCHE

No se pudo aplicar el parche automáticamente.
Se ha guardado una copia del parche en: ${backupPatchPath}

Para aplicar manualmente los cambios:
1. Examina el archivo de parche
2. Aplica los cambios manualmente a los archivos en la rama develop
3. Haz commit de los cambios: git add . && git commit -m "Aplicar cambios manualmente"
==========================================================================`);

        return false; // Patch falló
      }
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

  /**
   * Rebase a develop
   */
  async rebaseToDevelop() {
    try {
      // Verificar si hay cambios sin confirmar
      const status = await this.rootGit.git.status();
      let stashCreated = false;

      // Si hay cambios sin confirmar, hacer stash
      if (status.files.length > 0) {
        logger.info('Stashing uncommitted changes before rebase...');
        await this.rootGit.git.add('.');
        await this.rootGit.git.stash(['push', '-m', 'Temporary stash before rebase']);
        stashCreated = true;
      }

      try {
        // Cambiar a develop y hacer rebase
        await this.rootGit.git.checkout('develop');
        logger.info('Switched to develop branch');

        await this.rootGit.git.rebase(['base']);
        logger.info('Successfully rebased develop on base');

        // Si se creó un stash, intentar aplicarlo
        if (stashCreated) {
          logger.info('Applying stashed changes...');
          await this.rootGit.git.stash(['pop']);
          logger.info('Stashed changes applied successfully');
        }
      } catch (rebaseError) {
        // Si hay un error en el rebase pero creamos un stash, asegurarnos de restaurarlo
        if (stashCreated) {
          try {
            logger.info('Applying stashed changes after rebase error...');
            await this.rootGit.git.stash(['pop']);
            logger.info('Stashed changes applied successfully');
          } catch (stashError) {
            logger.error(`Failed to apply stash: ${stashError instanceof Error ? stashError.message : String(stashError)}`);
          }
        }
        throw rebaseError;
      }
    } catch (error) {
      logger.error(`Rebase failed: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Inicializar branches si es necesario
   */
  async ensureBranches() {
    const branches = await this.rootGit.git.branch();

    // Guardar el branch actual
    const currentBranch = await this.rootGit.git.revparse(['--abbrev-ref', 'HEAD']);

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
}
