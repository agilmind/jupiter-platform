import { Git } from './gitShell';
import * as path from 'path';
import { logger } from '@nx/devkit';
import { execSync } from 'child_process';
import * as fs from 'fs-extra';

/**
 * Extensión segura de Git para trabajar con proyectos específicos dentro de un monorepo
 */
export class NxProjectGit {
  private rootGit: Git;
  private projectDir: string;
  private absoluteProjectPath: string;

  constructor(rootPath: string, projectDir: string) {
    this.rootGit = new Git(rootPath);
    this.projectDir = projectDir;
    this.absoluteProjectPath = path.join(rootPath, projectDir);
  }

  /**
   * Preparar el directorio del proyecto específico para generación
   * Esta es una versión segura que solo opera en el directorio del proyecto
   */
  async prepareForGeneration() {
    try {
      // Verificar que estemos en el branch correcto
      await this.rootGit.git.checkout('base');

      // Asegurarse de que el directorio existe
      fs.ensureDirSync(this.absoluteProjectPath);

      // IMPORTANTE: Eliminar solo el contenido del directorio del proyecto, no todo
      logger.info(`Cleaning project directory: ${this.projectDir}`);

      // Usar comando Git que opere solo en el directorio específico
      const files = await this.rootGit.git.status();

      // Eliminar archivos existentes del directorio del proyecto
      if (fs.existsSync(this.absoluteProjectPath)) {
        const items = fs.readdirSync(this.absoluteProjectPath);
        for (const item of items) {
          const itemPath = path.join(this.absoluteProjectPath, item);

          // Solo eliminamos si no es un directorio git
          if (item !== '.git') {
            if (fs.lstatSync(itemPath).isDirectory()) {
              fs.removeSync(itemPath);
            } else {
              fs.unlinkSync(itemPath);
            }
          }
        }
      }

      logger.info(`Project directory prepared successfully`);
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

      // Añadir solo los archivos del directorio del proyecto
      // Escapamos correctamente la ruta para manejar espacios y caracteres especiales
      const projectDirPattern = this.projectDir.replace(/\\/g, '/') + '/**/*';
      await this.rootGit.git.add([projectDirPattern]);

      // Verificar si hay cambios para commit
      const status = await this.rootGit.git.status();
      if (status.files.length > 0) {
        await this.rootGit.git.commit(message);
        logger.info(`Changes committed: ${message}`);
      } else {
        logger.info('No changes to commit');
      }
    } catch (error) {
      logger.error(`Failed to add and commit changes: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Aplicar cambios como parche a develop
   */
  async patchToDevelop() {
    try {
      // Verificar si hay cambios sin confirmar
      const status = await this.rootGit.git.status();
      let stashCreated = false;

      // Si hay cambios sin confirmar, hacer stash
      if (status.files.length > 0) {
        logger.info('Stashing uncommitted changes before patch...');
        await this.rootGit.git.add('.');
        await this.rootGit.git.stash(['push', '-m', 'Temporary stash before patch']);
        stashCreated = true;
      }

      try {
        // Crear el parche desde branch base
        await this.rootGit.git.checkout('base');
        logger.info('Switched to base branch to create patch');

        const fileName = await this.rootGit.git.raw('format-patch', '-n', 'HEAD^');
        const patchFilePath = path.join(process.cwd(), fileName.trim());
        logger.info(`Created patch file: ${patchFilePath}`);

        // Cambiar a develop y aplicar el parche
        await this.rootGit.git.checkout('develop');
        logger.info('Switched to develop branch');

        await this.rootGit.git.applyPatch([patchFilePath], ['--ignore-space-change', '--ignore-whitespace', '--verbose']);
        logger.info('Patch applied successfully to develop branch');

        // Commit automático de los cambios aplicados
        await this.rootGit.git.add('.');
        await this.rootGit.git.commit(`Apply patch from base to develop: ${path.basename(this.projectDir)}`);
        logger.info('Committed patched changes to develop branch');

        // Limpiar el archivo de parche después de aplicarlo
        if (fs.existsSync(patchFilePath)) {
          fs.unlinkSync(patchFilePath);
          logger.info('Deleted patch file after applying');
        }

        // Si se creó un stash, intentar aplicarlo
        if (stashCreated) {
          logger.info('Applying stashed changes...');
          await this.rootGit.git.stash(['pop']);
          logger.info('Stashed changes applied successfully');
        }
      } catch (patchError) {
        // Si hay un error al aplicar el parche pero creamos un stash, asegurarnos de restaurarlo
        if (stashCreated) {
          try {
            logger.info('Applying stashed changes after patch error...');
            await this.rootGit.git.stash(['pop']);
            logger.info('Stashed changes applied successfully');
          } catch (stashError) {
            logger.error(`Failed to apply stash: ${stashError instanceof Error ? stashError.message : String(stashError)}`);
          }
        }
        throw patchError;
      }
    } catch (error) {
      logger.error(`Patch failed: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
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
