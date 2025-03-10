import * as path from 'path';
import { SimpleGit, simpleGit } from "simple-git";
import { logger } from '@nx/devkit';
import * as fs from 'fs-extra';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Clase que maneja operaciones Git para proyectos específicos en un monorepo NX.
 * Diseñada para el workflow del generador haijin, donde los archivos se crean en 'base'
 * y luego se sincronizan con 'develop'.
 */
export class NxProjectGit {
  public readonly git: SimpleGit;
  private readonly rootPath: string;
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
    this.rootPath = rootPath;
    this.git = simpleGit(rootPath);
    this.projectDir = projectDir;
    this.absoluteProjectPath = path.join(rootPath, projectDir);
  }

  // ─────────────────────────────────────────────────────────────────────
  // Métodos básicos de Git
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Obtiene el nombre del branch actual
   * @returns Nombre del branch actual
   */
  async getCurrentBranch(): Promise<string> {
    return await this.git.revparse(['--abbrev-ref', 'HEAD']);
  }

  /**
   * Verifica si un branch existe
   * @param branchName Nombre del branch a verificar
   */
  async branchExists(branchName: string): Promise<boolean> {
    const branches = await this.git.branch();
    return branches.all.includes(branchName);
  }

  /**
   * Asegura que existan los branches base y develop
   */
  async ensureBranches(): Promise<void> {
    const currentBranch = await this.getCurrentBranch();

    // Crear branch base si no existe
    if (!await this.branchExists(this.baseBranch)) {
      await this.git.checkout(['-b', this.baseBranch]);
      await this.git.checkout(currentBranch);
      logger.info(`Created ${this.baseBranch} branch`);
    }

    // Crear branch develop si no existe
    if (!await this.branchExists(this.developBranch)) {
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

      // Comprobar que el directorio existe
      if (!fs.existsSync(this.absoluteProjectPath)) {
        logger.warn(`Directory ${this.projectDir} does not exist, nothing to commit`);
        return;
      }

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
          logger.debug(`Explicitly added: ${file}`);
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
          if (rmError.message && rmError.message.includes('did not match any files')) {
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

  // ─────────────────────────────────────────────────────────────────────
  // Métodos para sincronizar cambios entre branches
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Aplica cambios de base a develop usando sincronización directa del directorio del proyecto
   * @returns true si la sincronización fue exitosa, false si hubo conflictos
   */
  async patchToDevelop(): Promise<boolean> {
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
   * Sincroniza SOLO los cambios del directorio específico del proyecto de base a develop
   * utilizando una estrategia que preserva los cambios existentes en develop
   * @returns true si la sincronización fue exitosa, false si hubo conflictos
   */
  async syncProjectDirectory(): Promise<boolean> {
    const originalBranch = await this.getCurrentBranch();

    try {
      // 1. Verificar que estamos en un estado seguro para proceder
      if (!await this.isSafeToSync()) {
        return false;
      }

      // 2. Verificar si el directorio existe en base
      await this.git.checkout(this.baseBranch);
      const existsInBase = fs.existsSync(this.absoluteProjectPath);

      if (!existsInBase) {
        logger.warn(`Directory ${this.projectDir} does not exist in ${this.baseBranch}, nothing to sync`);
        await this.git.checkout(this.developBranch);
        return true;
      }

      // 3. Crear un parche para SOLO los cambios en el directorio del proyecto
      const patchFile = await this.createProjectPatch();

      // 4. Cambiar a develop para aplicar el parche
      await this.git.checkout(this.developBranch);

      // 5. Verificar si el directorio existe en develop
      const existsInDevelop = fs.existsSync(this.absoluteProjectPath);

      if (!existsInDevelop) {
        // Si no existe en develop, crearlo y checkout directo desde base
        logger.info(`Directory ${this.projectDir} does not exist in ${this.developBranch}, creating it`);
        fs.mkdirSync(this.absoluteProjectPath, { recursive: true });

        await this.git.checkout([this.baseBranch, '--', this.projectDir]);
        await this.git.add([this.projectDir]);
        await this.git.commit(`Add ${this.projectDir} from ${this.baseBranch}`);

        logger.info(`Successfully added ${this.projectDir} to ${this.developBranch}`);

        // Limpiar el archivo de parche
        if (fs.existsSync(patchFile)) {
          fs.unlinkSync(patchFile);
        }

        return true;
      }

      // 6. Aplicar el parche con opciones que preservan cambios en develop
      try {
        const result = await this.applyPatchToDevelop(patchFile);

        // 7. Limpiar el archivo de parche si ya no es necesario
        if (fs.existsSync(patchFile) && result) {
          fs.unlinkSync(patchFile);
        }

        return result;
      } catch (patchError) {
        logger.error(`Failed to apply patch: ${patchError.message}`);

        // Guardar el parche para referencia
        logger.info(`Patch file saved at: ${patchFile}`);
        return false;
      }
    } catch (error) {
      logger.error(`Failed to sync project directory: ${error instanceof Error ? error.message : String(error)}`);

      // Asegurarse de estar en develop para la resolución de problemas
      try {
        const currentBranch = await this.getCurrentBranch();
        if (currentBranch !== this.developBranch) {
          await this.git.checkout(this.developBranch);
        }
      } catch (checkoutError) {
        logger.error(`Failed to checkout ${this.developBranch}: ${checkoutError.message}`);
      }

      return false;
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // Métodos auxiliares privados
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Verifica si es seguro realizar operaciones de sincronización
   * @returns true si es seguro proceder, false si no
   */
  private async isSafeToSync(): Promise<boolean> {
    try {
      // Verificar si develop existe
      if (!await this.branchExists(this.developBranch)) {
        logger.error(`Branch ${this.developBranch} does not exist. Please create it first.`);
        return false;
      }

      // Verificar si base existe
      if (!await this.branchExists(this.baseBranch)) {
        logger.error(`Branch ${this.baseBranch} does not exist. Please create it first.`);
        return false;
      }

      // Verificar que develop no tenga cambios sin commitear
      const currentBranch = await this.getCurrentBranch();
      await this.git.checkout(this.developBranch);

      const status = await this.git.status();

      if (status.files.length > 0) {
        logger.warn(`
==========================================================================
⚠️ ADVERTENCIA: El branch ${this.developBranch} tiene cambios sin commitear.

Para evitar perder estos cambios, por favor:
1. Haga commit de sus cambios con: git add . && git commit -m "Su mensaje"
2. O guárdelos temporalmente con: git stash save "Descripción"
3. Luego vuelva a ejecutar el generador

Operación cancelada para proteger sus cambios.
==========================================================================
        `);

        // Volver al branch original
        if (currentBranch !== this.developBranch) {
          await this.git.checkout(currentBranch);
        }

        return false;
      }

      // Volver al branch original
      if (currentBranch !== this.developBranch) {
        await this.git.checkout(currentBranch);
      }

      return true;
    } catch (error) {
      logger.error(`Failed to verify if it's safe to sync: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /**
   * Crea un parche con SOLO los cambios en el directorio del proyecto
   * @returns Ruta al archivo de parche
   */
  private async createProjectPatch(): Promise<string> {
    try {
      // 1. Obtener un hash para identificar el parche
      const patchId = Date.now().toString(36) + Math.random().toString(36).substring(2, 5);
      const patchFile = path.join(os.tmpdir(), `project-${path.basename(this.projectDir)}-${patchId}.patch`);

      logger.info(`Creating patch for ${this.projectDir} changes only`);

      // 2. Crear el parche usando git diff
      const diffCommand = [
        'diff',
        'HEAD~1',
        '--binary',        // Para archivos binarios
        '--full-index',    // Índices completos para mejor aplicación
        '--',              // Separador de paths
        this.projectDir    // Solo para este directorio
      ];

      // 3. Ejecutar el comando y guardar la salida en el archivo de parche
      const diffOutput = await this.git.raw(diffCommand);

      // 4. Si no hay cambios, devolver una ruta vacía
      if (!diffOutput || diffOutput.trim() === '') {
        logger.info(`No changes detected in ${this.projectDir}`);
        return '';
      }

      // 5. Guardar el parche en un archivo
      fs.writeFileSync(patchFile, diffOutput);
      logger.info(`Patch file created at: ${patchFile}`);

      return patchFile;
    } catch (error) {
      logger.error(`Failed to create project patch: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Aplica un parche a develop preservando los cambios existentes
   * @param patchFile Ruta al archivo de parche
   * @returns true si se aplicó exitosamente, false si hubo conflictos
   */
  private async applyPatchToDevelop(patchFile: string): Promise<boolean> {
    try {
      // Si no hay archivo de parche o está vacío, no hay nada que hacer
      if (!patchFile || !fs.existsSync(patchFile) || fs.statSync(patchFile).size === 0) {
        logger.info(`No changes to apply for ${this.projectDir}`);
        return true;
      }

      logger.info(`Applying patch to ${this.developBranch} for ${this.projectDir}`);

      try {
        // 1. Aplicar el parche con opciones que preservan cambios
        await this.git.raw([
          'apply',
          '--3way',            // Usar merge de 3 vías para mejor manejo de conflictos
          '--ignore-whitespace', // Ignorar cambios de espacios en blanco
          '--directory', this.rootPath, // Directorio base
          patchFile        // Archivo de parche
        ]);

        // 2. Verificar si hay cambios para commitear
        const status = await this.git.status();

        if (status.files.length > 0) {
          // 3. Añadir cambios y commitear
          await this.git.add([this.projectDir]);
          await this.git.commit(`Sync ${this.projectDir} from ${this.baseBranch} to ${this.developBranch}`);
          logger.info(`Successfully applied changes to ${this.developBranch}`);
        } else {
          logger.info(`No changes to commit after applying patch`);
        }

        return true;
      } catch (applyError) {
        // 4. Si hay conflictos, proporcionamos orientación pero no abortamos
        if (applyError.message.includes('CONFLICT') ||
            applyError.message.includes('conflict') ||
            applyError.message.includes('patch does not apply')) {

          logger.warn(`
==========================================================================
CONFLICTO DETECTADO

Se ha detectado un conflicto al sincronizar los cambios de '${this.baseBranch}' a
'${this.developBranch}' para el directorio ${this.projectDir}.

Para resolver este conflicto:

1. Los archivos conflictivos tendrán extensiones .orig, .rej o marcas de conflicto

2. Revisa estos archivos y resuelve los conflictos manualmente

3. Una vez resueltos, añade los cambios:
   $ git add ${this.projectDir}

4. Luego realiza el commit:
   $ git commit -m "Resolved conflicts for ${this.projectDir}"

Archivo de parche guardado en: ${patchFile}
==========================================================================
          `);

          return false;
        } else {
          // Otro tipo de error - intentamos un enfoque alternativo
          logger.warn(`Standard patch failed: ${applyError.message}`);

          // 5. Enfoque alternativo: intentar copiar directamente
          return await this.attemptDirectCopy();
        }
      }
    } catch (error) {
      logger.error(`Failed to apply patch: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /**
   * Intenta una copia directa como último recurso
   * @returns true si tuvo éxito, false si no
   */
  private async attemptDirectCopy(): Promise<boolean> {
    try {
      logger.info(`Attempting direct copy of ${this.projectDir} as fallback`);

      // 1. Crear un directorio temporal
      const tempDir = path.join(os.tmpdir(), `backup-${Date.now()}`);
      fs.mkdirSync(tempDir, { recursive: true });

      // 2. Hacer backup del directorio actual en develop
      if (fs.existsSync(this.absoluteProjectPath)) {
        fs.copySync(this.absoluteProjectPath, path.join(tempDir, path.basename(this.projectDir)));
        logger.info(`Backed up ${this.projectDir} to ${tempDir}`);
      }

      try {
        // 3. Checkout los archivos desde base
        await this.git.checkout([this.baseBranch, '--', this.projectDir]);

        // 4. Ver si hay cambios
        const status = await this.git.status();

        if (status.files.length > 0) {
          // 5. Añadir y commitear los cambios
          await this.git.add([this.projectDir]);
          await this.git.commit(`Manual copy of ${this.projectDir} from ${this.baseBranch} to ${this.developBranch}`);
          logger.info(`Successfully copied files from ${this.baseBranch}`);
        } else {
          logger.info(`No changes after direct copy`);
        }

        return true;
      } catch (copyError) {
        logger.error(`Direct copy failed: ${copyError.message}`);

        // 6. Restaurar backup si es posible
        const backupDir = path.join(tempDir, path.basename(this.projectDir));

        if (fs.existsSync(backupDir)) {
          // Limpiar el directorio actual
          fs.removeSync(this.absoluteProjectPath);
          // Restaurar desde backup
          fs.copySync(backupDir, this.absoluteProjectPath);
          logger.info(`Restored backup from ${backupDir}`);
        }

        return false;
      } finally {
        // 7. Limpiar directorio temporal
        if (fs.existsSync(tempDir)) {
          fs.removeSync(tempDir);
        }
      }
    } catch (error) {
      logger.error(`Failed in direct copy attempt: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }
}
