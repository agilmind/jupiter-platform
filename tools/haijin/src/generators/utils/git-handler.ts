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
  public git: SimpleGit;
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
   * Aplica cambios de base a develop usando merge de Git
   * @returns true si el merge fue exitoso, false si hubo conflictos
   */
  async patchToDevelop(): Promise<boolean> {
    try {
      // Cambiar a la rama develop
      await this.git.checkout(this.developBranch);
      logger.info(`Switched to ${this.developBranch} branch`);

      try {
        // Hacer el merge usando la estrategia --no-ff para crear siempre un commit de merge
        await this.git.merge([this.baseBranch, '--no-ff', '-m', `Merge changes from ${this.baseBranch} for ${path.basename(this.projectDir)}`]);
        logger.info(`Successfully merged ${this.baseBranch} into ${this.developBranch} without conflicts`);
        return true;
      } catch (mergeError) {
        // Si hay conflictos, Git los marcará en los archivos y dejará el merge en estado incompleto
        if (mergeError.message.includes('CONFLICT') || mergeError.message.includes('Merge conflict')) {
          logger.warn('Merge conflicts detected!');
          logger.info(`
==========================================================================
CONFLICTO DE MERGE DETECTADO

Se ha detectado un conflicto al hacer merge de '${this.baseBranch}' a '${this.developBranch}'.
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
          // El usuario debe resolver los conflictos manualmente
          return false;
        } else {
          // Si es otro tipo de error, abortamos el merge y propagamos el error
          try {
            await this.git.merge(['--abort']);
          } catch (abortError) {
            // Ignorar errores al abortar
          }
          throw mergeError;
        }
      }
    } catch (error) {
      logger.error(`Merge process failed: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
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
}
