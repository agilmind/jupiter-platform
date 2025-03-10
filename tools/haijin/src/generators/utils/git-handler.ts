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
   * utilizando características nativas de Git para restringir el merge a un directorio
   * @returns true si la sincronización fue exitosa, false si hubo conflictos
   */
  private async syncProjectDirectory(): Promise<boolean> {
    try {
      // 1. Cambiar a develop para aplicar los cambios
      await this.git.checkout(this.developBranch);
      logger.info(`Switched to ${this.developBranch} branch`);

      // 2. Realizar un merge de base a develop SOLO para el directorio específico
      try {
        // Usar --no-commit para que podamos revisar los cambios antes de commitear
        await this.git.raw(['merge', this.baseBranch, '--no-commit', '--', this.projectDir]);
        logger.info(`Merged changes from ${this.baseBranch} for directory: ${this.projectDir}`);

        // 3. Verificar si hay conflictos
        const status = await this.git.status();

        if (status.conflicted.length > 0) {
          // Hay conflictos
          logger.warn('Merge conflicts detected!');
          logger.info(`
==========================================================================
CONFLICTO DE MERGE DETECTADO (en directorio ${this.projectDir})

Se ha detectado un conflicto al sincronizar los cambios de '${this.baseBranch}' a '${this.developBranch}'.
Para resolver este conflicto, sigue estos pasos:

1. Resuelve los conflictos manualmente en los archivos marcados
   - Puedes usar tu editor o IDE para resolver los conflictos
   - Busca las marcas <<<<<<< HEAD, =======, y >>>>>>> para identificarlos

2. Una vez resueltos, marca los archivos como resueltos:
   $ git add [archivos_con_conflictos]

3. Completa el merge:
   $ git commit -m "Resolve merge conflicts"

4. Si deseas abortar el merge:
   $ git merge --abort
==========================================================================
`);
          return false;
        }

        // 4. Si no hay conflictos, commitear los cambios
        if (status.staged.length > 0 || status.not_added.length > 0 || status.modified.length > 0) {
          // Asegurarse de que todos los cambios están añadidos
          await this.git.add([this.projectDir]);

          // Commitear los cambios
          await this.git.commit(`Sync ${this.projectDir} from ${this.baseBranch} to ${this.developBranch}`);
          logger.info(`Changes committed to ${this.developBranch}`);
        } else {
          // No hay cambios, abort del merge
          await this.git.merge(['--abort']);
          logger.info(`No changes to sync for ${this.projectDir}`);
        }

        return true;
      } catch (mergeError) {
        // Manejar errores específicos
        if (mergeError.message.includes('CONFLICT') || mergeError.message.includes('Merge conflict')) {
          logger.warn('Merge conflicts detected!');
          logger.info(`
==========================================================================
CONFLICTO DE MERGE DETECTADO (en directorio ${this.projectDir})

Se ha detectado un conflicto al sincronizar los cambios de '${this.baseBranch}' a '${this.developBranch}'.
Para resolver este conflicto, sigue estos pasos:

1. Resuelve los conflictos manualmente en los archivos marcados
   - Puedes usar tu editor o IDE para resolver los conflictos
   - Busca las marcas <<<<<<< HEAD, =======, y >>>>>>> para identificarlos

2. Una vez resueltos, marca los archivos como resueltos:
   $ git add [archivos_con_conflictos]

3. Completa el merge:
   $ git commit -m "Resolve merge conflicts"

4. Si deseas abortar el merge:
   $ git merge --abort
==========================================================================
`);
          return false;
        } else {
          // Si el directorio no existe en base, tratamos de crearlo
          if (mergeError.message.includes('not something we can merge') ||
              mergeError.message.includes('does not exist in')) {

            logger.info(`Directory ${this.projectDir} may not exist in ${this.baseBranch}, trying alternative approach`);

            // Verificar si existe en base
            const currentBranch = await this.getCurrentBranch();
            await this.git.checkout(this.baseBranch);

            const existsInBase = fs.existsSync(this.absoluteProjectPath);

            if (existsInBase) {
              // Existe en base pero no puede ser mergeado, tratamos de usar checkout
              await this.git.checkout(this.developBranch);

              try {
                // Asegurarse de que el directorio existe en develop
                fs.mkdirSync(this.absoluteProjectPath, { recursive: true });

                // Traer los archivos específicos del directorio desde base
                await this.git.checkout([this.baseBranch, '--', this.projectDir]);
                logger.info(`Checked out ${this.projectDir} from ${this.baseBranch}`);

                // Commitear los cambios
                await this.git.add([this.projectDir]);
                await this.git.commit(`Add ${this.projectDir} from ${this.baseBranch} to ${this.developBranch}`);
                logger.info(`Added ${this.projectDir} to ${this.developBranch}`);

                return true;
              } catch (checkoutError) {
                logger.error(`Failed to checkout directory: ${checkoutError.message}`);
                throw checkoutError;
              }
            } else {
              // No existe ni en base ni en develop, nada que hacer
              await this.git.checkout(this.developBranch);
              logger.info(`Directory ${this.projectDir} does not exist in either branch`);
              return true;
            }
          } else {
            // Cualquier otro error, abortamos el merge y propagamos el error
            try {
              await this.git.merge(['--abort']);
            } catch (abortError) {
              // Ignorar errores al abortar
            }

            throw mergeError;
          }
        }
      }
    } catch (error) {
      logger.error(`Failed to sync project directory: ${error instanceof Error ? error.message : String(error)}`);

      // Intentar abortar cualquier operación pendiente
      try {
        const status = await this.git.status();
        if (status.current === this.developBranch && (status.conflicted.length > 0 || status.staged.length > 0)) {
          // Si hay un merge en progreso, abortarlo
          await this.git.merge(['--abort']);
          logger.info('Aborted merge operation');
        }
      } catch (cleanupError) {
        // Ignorar errores en la limpieza
      }

      throw error;
    }
  }
}
