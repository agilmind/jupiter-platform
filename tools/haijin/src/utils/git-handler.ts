import * as path from 'path';
import { SimpleGit, simpleGit } from "simple-git";
import { logger } from '@nx/devkit';
import * as fs from 'fs-extra';

/**
 * Clase que maneja operaciones Git para generadores de proyectos.
 * Proporciona funcionalidad básica de Git y métodos especializados para
 * trabajar con proyectos dentro de un monorepo Nx.
 */
export class GitHandler {
  // Base Git properties
  protected dirApp: string;
  protected git: SimpleGit;
  protected baseBranch: string = "base";
  protected developBranch: string = "develop";
  protected mainBranch: string = "main";

  // Project specific properties (for NX monorepo context)
  protected projectDir?: string;
  protected absoluteProjectPath?: string;

  /**
   * Constructor para uso general
   * @param rootPath Directorio raíz del repositorio Git
   */
  constructor(rootPath: string);

  /**
   * Constructor para uso con proyectos específicos dentro de un monorepo
   * @param rootPath Directorio raíz del repositorio Git
   * @param projectDir Directorio relativo del proyecto dentro del monorepo (ej: 'apps/myapp')
   */
  constructor(rootPath: string, projectDir?: string);

  constructor(rootPath: string, projectDir?: string) {
    this.dirApp = rootPath;
    this.git = simpleGit(this.dirApp);

    if (projectDir) {
      this.projectDir = projectDir;
      this.absoluteProjectPath = path.join(rootPath, projectDir);
    }
  }

  // ------------------------------------------------------------------------
  // Métodos básicos de Git (funcionalidad del antiguo GitShell)
  // ------------------------------------------------------------------------

  /**
   * Inicializa un repositorio Git con tres ramas: main, develop y base.
   * @param projectName Nombre del proyecto para usar en archivos iniciales
   */
  async init(projectName: string) {
    try {
      await this.git.init();

      // Crear rama main
      await this.git.checkout(["-b", this.mainBranch]);
      await fs.writeFile(
        path.join(this.dirApp, `${this.mainBranch}.json`),
        `{"projectName": "${projectName}"}`
      );
      await this.git.add("./*");
      await this.git.commit("initial");

      // Crear rama develop
      await this.git.checkout(["-b", this.developBranch]);
      await fs.writeFile(
        path.join(this.dirApp, `${this.developBranch}.json`),
        `{"projectName": "${projectName}"}`
      );
      await this.git.add("./*");
      await this.git.commit("initial");

      // Crear rama base
      await this.git.checkout(["-b", this.baseBranch]);
      await fs.writeFile(
        path.join(this.dirApp, `${this.baseBranch}.json`),
        `{"projectName": "${projectName}"}`
      );
      await this.git.add("./*");
      await this.git.commit("initial");
    } catch(e) {
      throw e;
    }
  }

  /**
   * Añade todos los archivos y crea un commit
   * @param message Mensaje de commit
   */
  async addAndCommit(message: string) {
    if (this.projectDir) {
      return this.addAndCommitProject(message);
    }

    await this.git.add("./*");
    await this.git.commit(message);
    logger.info(`Changes committed: ${message}`);
  }

  /**
   * Revierte cambios a HEAD
   */
  async revertChanges() {
    await this.git.reset(["--hard", "HEAD"]);
  }

  /**
   * Obtiene el último mensaje de commit
   */
  async getLastMessage() {
    const message = await this.git.log(["-1", "--pretty=%B"]);
    return message && message.latest ? message.latest.hash : "base changes";
  }

  /**
   * Verifica si hay cambios pendientes en una rama
   * @param branchName Nombre de la rama
   * @returns Array de archivos con cambios
   */
  async hasPendingCommits(branchName: string) {
    await this.git.checkout(branchName);
    const status = await this.git.status();
    return status.files;
  }

  /**
   * Aplica cambios de base a develop usando un parche
   */
  async patchToDevelop() {
    if (this.projectDir) {
      return this.patchProjectToDevelop();
    }

    await this.git.checkout(this.baseBranch);
    const fileName = await this.git.raw("format-patch", "-n", "HEAD^");
    const patchFilePath = path.join(this.dirApp, fileName.trim());
    await this.git.checkout(this.developBranch);
    await this.git.applyPatch([patchFilePath], ["--ignore-space-change", "--ignore-whitespace", '--verbose']);

    // Limpiar el archivo de parche
    if (fs.existsSync(patchFilePath)) {
      fs.unlinkSync(patchFilePath);
    }

    return true;
  }

  /**
   * Aplica cambios de base a develop usando rebase
   */
  async rebaseToDevelop() {
    if (this.projectDir) {
      return this.rebaseProjectToDevelop();
    }

    await this.git.checkout(this.developBranch);
    await this.git.rebase([this.baseBranch]);
    return true;
  }

  /**
   * Prepara el directorio para generación, limpiando archivos existentes
   */
  async prepareForGeneration() {
    if (this.projectDir) {
      return this.prepareProjectForGeneration();
    }

    const files = await this.hasPendingCommits(this.developBranch);
    if (files.length === 0) {
      await this.git.checkout(this.baseBranch);
      await this.git.rm(["-r", "./*"]);
    } else {
      const filesStr = files.map(x => x.path).join("\n");
      throw Error(`${this.developBranch} has pending commits\n${filesStr}`)
    }
  }

  // ------------------------------------------------------------------------
  // Métodos específicos para proyectos en monorepo (antiguo GitExtender)
  // ------------------------------------------------------------------------

  /**
   * Asegura que existan las ramas base y develop
   */
  async ensureBranches() {
    if (!this.projectDir) {
      throw new Error("Project directory not specified for ensureBranches()");
    }

    const branches = await this.git.branch();

    // Guardar el branch actual
    const currentBranch = await this.git.revparse(['--abbrev-ref', 'HEAD']);

    // Verificar y crear branch base si no existe
    if (!branches.all.includes('base')) {
      await this.git.checkout(['-b', 'base']);
      await this.git.checkout(currentBranch);
    }

    // Verificar y crear branch develop si no existe
    if (!branches.all.includes('develop')) {
      await this.git.checkout(['-b', 'develop']);
      await this.git.checkout(currentBranch);
    }
  }

  /**
   * Prepara el directorio de proyecto específico para generación
   */
  private async prepareProjectForGeneration() {
    if (!this.projectDir || !this.absoluteProjectPath) {
      throw new Error("Project directory not specified for prepareProjectForGeneration()");
    }

    try {
      // Eliminar archivos físicamente en la rama actual antes de checkout
      if (fs.existsSync(this.absoluteProjectPath)) {
        logger.info(`Removing files from current branch before checkout...`);
        fs.removeSync(this.absoluteProjectPath);
        logger.info(`Files removed successfully`);
      }

      // Cambiar a rama base
      await this.git.checkout('base');
      logger.info('Switched to base branch');

      // Asegurar que existe el directorio
      fs.ensureDirSync(this.absoluteProjectPath);

      // Eliminar archivos existentes en base
      try {
        logger.info(`Removing existing files from base branch...`);
        await this.git.rm(['-r', `${this.projectDir}/*`]);
        logger.info(`Project directory cleaned in base branch`);
      } catch (rmError) {
        // Si el error es por archivos inexistentes, ignorarlo
        if (rmError.message && rmError.message.includes('did not match any files')) {
          logger.info(`No files found to remove in base branch`);
        } else {
          throw rmError;
        }
      }

      logger.info(`Ready for file generation in base branch`);
    } catch (error) {
      logger.error(`Failed to prepare project directory: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Añade y commitea cambios específicos del proyecto
   */
  private async addAndCommitProject(message: string) {
    if (!this.projectDir) {
      throw new Error("Project directory not specified for addAndCommitProject()");
    }

    try {
      logger.info(`Adding changes in ${this.projectDir}`);

      // Listar archivos del proyecto para log
      const projectFiles = await this.listAllProjectFiles();
      logger.info(`Found ${projectFiles.length} files in project directory`);

      // Añadir directorio del proyecto completo
      await this.git.add([this.projectDir]);

      // Verificar archivos críticos específicamente
      const criticalFiles = [
        path.join(this.projectDir, 'project.json'),
        path.join(this.projectDir, 'tsconfig.json'),
        path.join(this.projectDir, 'tsconfig.app.json')
      ];

      for (const file of criticalFiles) {
        if (fs.existsSync(file)) {
          await this.git.add([file]);
          logger.debug(`Explicitly added: ${file}`);
        }
      }

      // Verificar cambios pendientes para commit
      const status = await this.git.status();

      if (status.files.length > 0) {
        const filesPaths = status.files.map(f => f.path).join(', ');
        logger.debug(`Files to be committed: ${filesPaths}`);
        await this.git.commit(message);
        logger.info(`Changes committed with message: ${message}`);
        return true;
      } else {
        logger.info('No changes to commit');
        return false;
      }
    } catch (error) {
      logger.error(`Failed to add and commit project: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Aplica cambios desde base a develop con rebase, específico para proyectos
   */
  private async rebaseProjectToDevelop() {
    try {
      // Cambiar a develop y hacer rebase
      await this.git.checkout('develop');
      logger.info('Switched to develop branch');

      try {
        // Intentar rebase
        await this.git.rebase(['base']);
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
            const patchFilePath = path.join(process.cwd(), `${path.basename(this.projectDir || 'project')}-conflict-resolution.patch`);
            const diffOutput = await this.git.diff(['base', 'HEAD']);
            fs.writeFileSync(patchFilePath, diffOutput);
            logger.info(`Patch file created at: ${patchFilePath}`);
          } catch (patchError) {
            logger.warn(`Could not create patch file: ${patchError.message}`);
          }

          return false; // Hay conflictos
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
   * Aplica cambios desde base a develop usando patch, específico para proyectos
   */
  private async patchProjectToDevelop() {
    try {
      // Crear parche desde branch base
      await this.git.checkout('base');
      logger.info('Switched to base branch to create patch');

      // Crear y aplicar parche
      let patchFilePath;
      try {
        // Intentar con format-patch primero
        const fileName = await this.git.raw('format-patch', '-1', 'HEAD');
        patchFilePath = path.join(process.cwd(), fileName.trim());
        logger.info(`Created patch file: ${patchFilePath}`);
      } catch (formatError) {
        logger.warn(`Failed to create patch with format-patch: ${formatError.message}`);

        // Alternativa usando diff
        const diffOutput = await this.git.diff(['HEAD~1', 'HEAD']);
        patchFilePath = path.join(process.cwd(), `${path.basename(this.projectDir || 'project')}.patch`);
        fs.writeFileSync(patchFilePath, diffOutput);
        logger.info(`Created patch file using diff: ${patchFilePath}`);
      }

      // Cambiar a develop
      await this.git.checkout('develop');
      logger.info('Switched to develop branch');

      try {
        // Aplicar parche con opciones extendidas
        await this.git.applyPatch([patchFilePath], [
          '--ignore-space-change',
          '--ignore-whitespace',
          '--reject',
          '--whitespace=fix'
        ]);
        logger.info('Patch applied successfully to develop branch');

        // Verificar archivos rechazados (.rej) por conflictos
        const rejFiles = await this.findRejFiles();
        if (rejFiles.length > 0) {
          // Hay conflictos
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

          return false; // Hay conflictos
        }

        // Añadir y commitear cambios
        if (this.projectDir) {
          await this.git.add([this.projectDir]);
        } else {
          await this.git.add('.');
        }
        await this.git.commit(`Apply patch from base to develop: ${path.basename(this.projectDir || 'project')}`);
        logger.info('Committed patched changes to develop branch');

        // Limpiar archivo de parche
        if (fs.existsSync(patchFilePath)) {
          fs.unlinkSync(patchFilePath);
          logger.info('Deleted patch file after applying');
        }

        return true; // Patch exitoso
      } catch (applyError) {
        logger.error(`Error applying patch: ${applyError.message}`);

        // Guardar copia del parche para referencia
        const backupPatchPath = path.join(process.cwd(), `${path.basename(this.projectDir || 'project')}-manual-patch.patch`);
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
   * Lista todos los archivos en el directorio del proyecto
   */
  private async listAllProjectFiles(): Promise<string[]> {
    if (!this.absoluteProjectPath) return [];

    const files: string[] = [];

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
   * Encuentra archivos .rej (rechazados durante la aplicación de un parche)
   */
  private async findRejFiles(): Promise<string[]> {
    if (!this.absoluteProjectPath) return [];

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

// Para mantener compatibilidad con código existente
export class Git extends GitHandler {}

// Para mantener compatibilidad con código existente
export class NxProjectGit extends GitHandler {
  constructor(rootPath: string, projectDir: string) {
    super(rootPath, projectDir);
  }
}
