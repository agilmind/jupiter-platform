import { Git } from './gitShell';
import * as path from 'path';
import { logger } from '@nx/devkit';
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
    // Añadir solo los archivos del directorio del proyecto
    await this.rootGit.git.add(path.join(this.projectDir, '/*'));
    await this.rootGit.git.commit(message);
  }

  /**
   * Aplicar cambios como parche a develop
   */
  async patchToDevelop() {
    await this.rootGit.git.checkout('base');
    const fileName = await this.rootGit.git.raw('format-patch', '-n', 'HEAD^');
    const patchFilePath = path.join(process.cwd(), fileName.trim());
    await this.rootGit.git.checkout('develop');
    await this.rootGit.git.applyPatch([patchFilePath], ['--ignore-space-change', '--ignore-whitespace', '--verbose']);

    // Limpiar el archivo de parche después de aplicarlo
    if (fs.existsSync(patchFilePath)) {
      fs.unlinkSync(patchFilePath);
    }
  }

  /**
   * Rebase a develop
   */
  async rebaseToDevelop() {
    await this.rootGit.git.checkout('develop');
    await this.rootGit.git.rebase(['base']);
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
