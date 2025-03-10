import * as path from 'path';
import { SimpleGit, simpleGit } from "simple-git";
import { logger } from '@nx/devkit';
import * as fs from 'fs-extra';

/**
 * Clase que maneja operaciones Git para proyectos específicos en un monorepo NX.
 * Diseñada para el workflow del generador haijin, donde los archivos se crean en 'base'
 * y luego se sincronizan con 'develop'.
 */
export class NxProjectGit {
  public readonly git: SimpleGit;
  private readonly projectDir: string;
  private readonly absoluteProjectPath: string;

  // Nombres de branches configurables
  private readonly baseBranch: string = "base";
  private readonly developBranch: string = "develop";

  /**
   * Constructor
   * @param rootPath Ruta raíz del proyecto (workspace)
   * @param projectDir Directorio relativo del proyecto
   */
  constructor(rootPath: string, projectDir: string) {
    this.git = simpleGit(rootPath);
    this.projectDir = projectDir;
    this.absoluteProjectPath = path.join(rootPath, projectDir);
  }

  /**
   * Obtiene el nombre del branch actual
   * @returns Nombre del branch actual
   */
  async getCurrentBranch(): Promise<string> {
    return await this.git.revparse(['--abbrev-ref', 'HEAD']);
  }

  /**
   * Asegura que existan los branches base y develop
   */
  async ensureBranches(): Promise<void> {
    const branches = await this.git.branch();
    const currentBranch = await this.getCurrentBranch();

    // Crear branch base si no existe
    if (!branches.all.includes(this.baseBranch)) {
      await this.git.checkout(['-b', this.baseBranch]);
      await this.git.checkout(currentBranch);
      logger.info(`Created ${this.baseBranch} branch`);
    }

    // Crear branch develop si no existe
    if (!branches.all.includes(this.developBranch)) {
      await this.git.checkout(['-b', this.developBranch]);
      await this.git.checkout(currentBranch);
      logger.info(`Created ${this.developBranch} branch`);
    }
  }

  /**
   * Añade y commitea los cambios del proyecto actual
   * @param message Mensaje de commit
   */
  async addAndCommit(message: string): Promise<void> {
    try {
      logger.info(`Adding changes in ${this.projectDir}`);

      // Añadir todos los archivos del proyecto explícitamente
      await this.git.add([this.projectDir]);

      // Verificar archivos críticos y asegurar que estén incluidos
      const criticalFiles = [
        path.join(this.projectDir, 'project.json'),
        path.join(this.projectDir, 'tsconfig.json'),
        path.join(this.projectDir, 'tsconfig.app.json')
      ];

      for (const file of criticalFiles) {
        if (fs.existsSync(file)) {
          await this.git.add([file]);
          logger.info(`Explicitly added: ${file}`);
        }
      }

      // Verificar si hay cambios para commit
      const status = await this.git.status();
      const projectFiles = status.files.filter(f => f.path.startsWith(this.projectDir));

      if (projectFiles.length > 0) {
        logger.info(`Files to be committed: ${projectFiles.map(f => f.path).join(', ')}`);
        await this.git.commit(message);
        logger.info(`Changes committed: ${message}`);
        return;
      }

      logger.info('No changes to commit');
    } catch (error) {
      logger.error(`Failed to add and commit changes: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Aplica cambios de base a develop usando sincronización directa del directorio del proyecto
   * @returns true si la sincronización fue exitosa, false si hubo conflictos
   */
  async patchToDevelop(): Promise<boolean> {
    // Usar el método especializado para sincronizar solo el directorio del proyecto
    return await this.syncProjectDirectory();
  }

  /**
   * Sincroniza cambios de base a develop (alias de patchToDevelop para mantener compatibilidad)
   * @returns true si la sincronización fue exitosa, false si hubo conflictos
   */
  async rebaseToDevelop(): Promise<boolean> {
    return await this.patchToDevelop();
  }

  /**
   * Limpia el directorio del proyecto en el branch actual
   * Usado principalmente en el branch base antes de generar nuevos archivos
   */
  async cleanProjectDirectory(): Promise<void> {
    try {
      // Verificar si el directorio existe
      if (fs.existsSync(this.absoluteProjectPath)) {
        try {
          // Intentar eliminar archivos con git rm
          await this.git.rm(['-r', `${this.projectDir}/*`]);
          logger.info(`Cleaned existing files in project directory`);
        } catch (rmError) {
          if (rmError.message.includes('did not match any files')) {
            logger.info(`No files found to clean in project directory`);
          } else {
            throw rmError;
          }
        }
      } else {
        // Crear el directorio si no existe
        fs.mkdirSync(this.absoluteProjectPath, { recursive: true });
        logger.info(`Created project directory: ${this.projectDir}`);
      }
    } catch (error) {
      logger.error(`Failed to clean project directory: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Sincroniza SOLO los cambios del directorio específico del proyecto de base a develop
   * utilizando una estrategia segura que preserva los cambios existentes en develop
   * @returns true si la sincronización fue exitosa, false si hubo conflictos
   */
  async syncProjectDirectory(): Promise<boolean> {
    try {
      // Verificar el estado inicial de develop antes de cualquier operación
      const developBranchStatus = await this.verifyBranchStatus('develop');

      // Si develop tiene cambios sin commitear, debemos protegerlos
      if (developBranchStatus.hasChanges) {
        logger.warn(`
  ==========================================================================
  ⚠️ ADVERTENCIA: El branch develop tiene cambios sin commitear.

  Para evitar perder estos cambios, por favor:
  1. Vuelva al branch develop con: git checkout develop
  2. Haga commit de sus cambios o guárdelos con: git stash save
  3. Luego vuelva a ejecutar el generador

  Operación cancelada para proteger sus cambios.
  ==========================================================================
        `);
        return false;
      }

      // 1. Cambiar a develop para aplicar los cambios
      await this.git.checkout('develop');
      logger.info(`Switched to ${this.developBranch} branch`);

      // 2. Verificar si hay cambios recientes en develop desde base
      const hasNewCommits = await this.hasDevelopNewCommits();
      const mergeStrategy = hasNewCommits ? '--no-ff' : '--ff-only';

      // 3. Usar cherry-pick para el directorio específico en lugar de merge
      try {
        // Identificar el último commit en base para este directorio
        await this.git.checkout('base');
        const baseCommits = await this.git.log(['--pretty=format:%H', '--', this.projectDir]);

        if (!baseCommits.all || baseCommits.all.length === 0) {
          logger.info(`No hay commits en base para el directorio ${this.projectDir}`);
          await this.git.checkout('develop');
          return true;
        }

        const latestBaseCommit = baseCommits.all[0];

        // Volver a develop para aplicar los cambios
        await this.git.checkout('develop');

        // Usar checkout para traer solo el directorio específico
        try {
          // Crear una rama temporal para control de conflictos
          const tempBranch = `temp-sync-${Date.now()}`;
          await this.git.checkoutBranch(tempBranch, 'develop');

          // Hacer checkout del directorio específico desde base
          await this.git.checkout(['base', '--', this.projectDir]);

          // Verificar si hay cambios
          const status = await this.git.status();

          if (status.files.length > 0) {
            // Añadir y commitear cambios en la rama temporal
            await this.git.add([this.projectDir]);
            await this.git.commit(`Sync ${this.projectDir} from base to develop`);

            // Volver a develop
            await this.git.checkout('develop');

            // Hacer cherry-pick del commit de la rama temporal
            await this.git.raw(['cherry-pick', tempBranch]);

            // Eliminar la rama temporal
            await this.git.branch(['-D', tempBranch]);

            logger.info(`Successfully synchronized ${this.projectDir} to develop branch`);
          } else {
            // No hay cambios, cancelar
            await this.git.checkout('develop');
            await this.git.branch(['-D', tempBranch]);
            logger.info(`No changes to sync for ${this.projectDir}`);
          }

          return true;
        } catch (checkoutError) {
          // Si hay conflictos en el cherry-pick
          if (checkoutError.message.includes('CONFLICT') || checkoutError.message.includes('conflict')) {
            logger.warn('Cherry-pick conflicts detected!');
            logger.info(`
  ==========================================================================
  CONFLICTO DETECTADO

  Se ha detectado un conflicto al sincronizar los cambios de '${this.baseBranch}' a
  '${this.developBranch}' para el directorio ${this.projectDir}.

  Para resolver este conflicto, sigue estos pasos:

  1. Resuelve los conflictos manualmente en los archivos marcados
     - Puedes usar tu editor o IDE para resolver los conflictos
     - Busca las marcas <<<<<<< HEAD, =======, y >>>>>>> para identificarlos

  2. Una vez resueltos, marca los archivos como resueltos:
     $ git add [archivos_con_conflictos]

  3. Completa el cherry-pick:
     $ git cherry-pick --continue

  4. Si deseas abortar la operación:
     $ git cherry-pick --abort
  ==========================================================================
            `);
            return false;
          } else {
            // Intentar un enfoque más simple: copiar archivos manualmente
            logger.warn(`Cherry-pick failed, trying direct copy approach...`);

            // Volver a develop
            await this.git.checkout('develop');

            // Crear el directorio si no existe
            if (!fs.existsSync(this.absoluteProjectPath)) {
              fs.mkdirSync(this.absoluteProjectPath, { recursive: true });
            }

            // Copiar archivos desde base
            await this.git.checkout('base');
            const baseFiles = this.listFilesInDir(this.absoluteProjectPath);

            await this.git.checkout('develop');
            for (const file of baseFiles) {
              const relPath = path.relative(this.absoluteProjectPath, file);
              const destPath = path.join(this.absoluteProjectPath, relPath);

              // Crear directorio padre si no existe
              const destDir = path.dirname(destPath);
              if (!fs.existsSync(destDir)) {
                fs.mkdirSync(destDir, { recursive: true });
              }

              // Copiar el archivo
              fs.copyFileSync(file, destPath);
            }

            // Añadir y commitear los cambios
            await this.git.add([this.projectDir]);
            await this.git.commit(`Manual sync of ${this.projectDir} from base to develop`);

            logger.info(`Successfully synchronized ${this.projectDir} using direct copy approach`);
            return true;
          }
        }
      } catch (mergeError) {
        logger.error(`Failed to synchronize ${this.projectDir}: ${mergeError.message}`);

        // Intentar volver a develop en caso de error
        try {
          await this.git.checkout('develop');
        } catch (checkoutError) {
          // Ignorar errores adicionales
        }

        throw mergeError;
      }
    } catch (error) {
      logger.error(`Failed to sync project directory: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Verifica el estado de un branch: si tiene cambios sin commitear
   */
  private async verifyBranchStatus(branchName: string): Promise<{ exists: boolean; hasChanges: boolean }> {
    try {
      // Guardar el branch actual
      const currentBranch = await this.getCurrentBranch();

      // Verificar si el branch existe
      const branches = await this.git.branch();
      const exists = branches.all.includes(branchName);

      if (!exists) {
        return { exists: false, hasChanges: false };
      }

      // Cambiar al branch para verificar su estado
      await this.git.checkout(branchName);

      // Verificar si hay cambios sin commitear
      const status = await this.git.status();
      const hasChanges = status.files.length > 0;

      // Volver al branch original
      if (currentBranch !== branchName) {
        await this.git.checkout(currentBranch);
      }

      return { exists, hasChanges };
    } catch (error) {
      logger.error(`Failed to verify branch status: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Verifica si develop tiene commits que base no tiene
   */
  private async hasDevelopNewCommits(): Promise<boolean> {
    try {
      // Obtener el commit común más reciente entre base y develop
      const mergeBase = await this.git.raw(['merge-base', 'base', 'develop']);

      // Contar cuántos commits hay en develop desde ese punto común
      const commits = await this.git.log(['--oneline', `${mergeBase.trim()}..develop`]);

      return commits.total > 0;
    } catch (error) {
      logger.error(`Failed to check for new commits: ${error instanceof Error ? error.message : String(error)}`);
      return true; // Por precaución, asumimos que hay cambios
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
}
