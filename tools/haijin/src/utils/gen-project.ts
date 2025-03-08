import { Tree, formatFiles, logger, installPackagesTask, generateFiles } from '@nx/devkit';
import { execSync } from 'child_process';
import { Git } from './gitShell';
import * as fs from 'fs';
import * as path from 'path';

export interface AddProjectOptions {
  name: string;
  type: string;
  projectType: 'app' | 'service';
  options?: string;
  dependencies?: {
    prod?: string[];
    dev?: string[];
  };
  templatePath: string;
  projectUpdates?: (projectDir: string, projectName: string) => void;
  update?: boolean;
  cwd?: string;
}

export async function generateProject(
  tree: Tree,
  options: AddProjectOptions
) {
  // Determinar directorio y nombre de proyecto
  const directoryPrefix = options.projectType === 'app' ? 'apps' : 'services';
  const projectPrefix = options.projectType === 'app' ? 'app' : 'services';

  const projectDir = `${directoryPrefix}/${options.name}`;
  const projectName = `${projectPrefix}-${options.name}`;

  // Verificar si el proyecto ya existe
  const projectExists = fs.existsSync(projectDir);

  // Si existe y no está en modo update, preguntar al usuario
  if (projectExists && !options.update) {
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });
    const answer = await new Promise<string>(resolve => {
      readline.question(`Project ${options.name} already exists. Do you want to update it? (y/N): `, resolve);
    });
    readline.close();
    if (answer.toLowerCase() !== 'y') {
      logger.info('Update cancelled. Exiting...');
      return;
    }
    logger.info(`Updating ${options.type} ${options.projectType}: ${options.name}`);
  } else {
    logger.info(`Adding ${options.type} ${options.projectType}: ${options.name}`);
  }

  try {
    // Instalar dependencias (esto se puede hacer antes de generar archivos)
    if (options.dependencies) {
      logger.info('Installing dependencies...');

      if (options.dependencies.prod && options.dependencies.prod.length > 0) {
        execSync(`npm install ${options.dependencies.prod.join(' ')} --save --legacy-peer-deps`, { stdio: 'inherit' });
      }

      if (options.dependencies.dev && options.dependencies.dev.length > 0) {
        execSync(`npm install ${options.dependencies.dev.join(' ')} --save-dev --legacy-peer-deps`, { stdio: 'inherit' });
      }
    }

    // Generar archivos - esto modifica el árbol virtual
    logger.info('Generating template files...');
    generateFiles(
      tree,
      options.templatePath,
      projectDir,
      {
        ...options,
        template: '',
        dot: '.'
      },
      { overwrite: true }
    );

    // Aplicar actualizaciones específicas si es necesario
    if (options.projectUpdates) {
      options.projectUpdates(projectDir, projectName);
    }

    // Formatear y escribir cambios
    await formatFiles(tree);

    // *** IMPORTANTE: TODAS LAS OPERACIONES DE GIT VAN EN LA FUNCIÓN DE RETORNO ***
    // Esta función se ejecutará DESPUÉS de que Nx escriba físicamente los archivos
    return () => {
      logger.info('Executing post-generation Git operations...');

      // Obtener el estado actual de Git
      const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
      logger.info(`Current branch: ${currentBranch}`);

      try {
        // Crear directorio temporal FUERA del repo
        const homeDir = require('os').homedir();
        const tempDir = path.join(homeDir, '.haijin-temp-files');

        // Asegurarnos que el directorio temporal existe
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        } else {
          // Limpiar cualquier contenido previo
          fs.rmSync(tempDir, { recursive: true, force: true });
          fs.mkdirSync(tempDir, { recursive: true });
        }

        logger.info(`Created temporary directory at ${tempDir}`);

        // Crear la estructura completa de directorios en el temp
        const tempProjectDir = path.join(tempDir, projectDir);
        fs.mkdirSync(tempProjectDir, { recursive: true });

        // PASO CRÍTICO 1: Copiar los archivos generados al directorio temporal
        logger.info(`Backing up generated files...`);
        execSync(`cp -r ${projectDir}/* ${tempProjectDir}/`, { stdio: 'inherit' });

        // PASO CRÍTICO 2: Eliminar archivos generados del branch actual
        logger.info(`Removing generated files from current branch...`);
        execSync(`rm -rf ${projectDir}`, { stdio: 'inherit' });

        // Guardar el estado actual antes de cambiar de branch
        let stashCreated = false;
        const hasUncommittedChanges = execSync('git status --porcelain', { encoding: 'utf8' }).trim().length > 0;

        if (hasUncommittedChanges) {
          logger.info('Creating stash with current changes...');
          execSync('git add --all', { stdio: 'inherit' });
          execSync('git stash push -m "Temporary stash for haijin generator"', { stdio: 'inherit' });
          stashCreated = true;
        }

        // ===== PASO A BASE =====
        const branchExists = execSync('git branch --list base', { encoding: 'utf8' }).trim().length > 0;

        if (branchExists) {
          execSync('git checkout base', { stdio: 'inherit' });
        } else {
          execSync('git checkout -b base', { stdio: 'inherit' });
        }
        logger.info('✓ Switched to base branch');

        // Verificar que estamos realmente en base
        const actualBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
        if (actualBranch !== 'base') {
          throw new Error(`Failed to switch to base branch! Currently on ${actualBranch}`);
        }

        // PASO CRÍTICO 3: Recrear el directorio del proyecto en base
        logger.info(`Recreating project directory in base branch...`);
        fs.mkdirSync(projectDir, { recursive: true });

        // PASO CRÍTICO 4: Copiar archivos desde el directorio temporal
        logger.info(`Copying files to ${projectDir} in base branch...`);
        execSync(`cp -r ${tempProjectDir}/* ${projectDir}/`, { stdio: 'inherit' });

        // Añadir y hacer commit de los archivos
        logger.info(`Adding generated files in ${projectDir}...`);
        execSync(`git add ${projectDir}`, { stdio: 'inherit' });

        const gitStatus = execSync('git status --porcelain', { encoding: 'utf8' });
        if (gitStatus.trim().length > 0) {
          const action = projectExists ? 'Update' : 'Add';
          execSync(`git commit -m "${action} ${options.type} ${options.projectType}: ${options.name}"`, { stdio: 'inherit' });
          logger.info(`✓ Changes committed to base branch`);

          // Crear un parche con los cambios para usar en caso de conflictos
          logger.info(`Creating patch file with changes...`);
          const patchFile = path.join(process.cwd(), `${options.name}-changes.patch`);
          execSync(`git format-patch -1 HEAD --stdout > ${patchFile}`, { stdio: 'inherit' });
          logger.info(`✓ Patch file created: ${patchFile}`);
        } else {
          logger.info(`No changes detected in ${projectDir}`);
        }

        // ===== MERGE A DEVELOP =====
        const developExists = execSync('git branch --list develop', { encoding: 'utf8' }).trim().length > 0;

        if (developExists) {
          execSync('git checkout develop', { stdio: 'inherit' });
        } else {
          execSync('git checkout -b develop', { stdio: 'inherit' });
        }
        logger.info('✓ Switched to develop branch');

        // Intentar merge desde base
        logger.info('Attempting to merge from base to develop...');
        try {
          // Añadimos un mensaje de commit predefinido al merge para evitar la solicitud interactiva
          const mergeMsg = `Merge ${options.type} ${options.projectType} ${options.name} from base to develop`;
          execSync(`git merge base -X theirs -m "${mergeMsg}"`, { stdio: 'inherit' });
          logger.info('✓ Successfully merged from base to develop');

          const gitStatus2 = execSync('git status --porcelain', { encoding: 'utf8' });
          if (gitStatus2.trim().length > 0) {
            const action = projectExists ? 'Update' : 'Complete';
            execSync(`git commit -m "${action} ${options.type} ${options.projectType} setup: ${options.name}"`, { stdio: 'inherit' });
            logger.info('✓ Merge changes committed');
          }
        } catch (mergeError) {
          logger.error(`❌ Merge conflict detected. Aborting merge.`);
          execSync('git merge --abort', { stdio: 'inherit' });
          logger.info(`💡 Please resolve conflicts manually by applying the patch file: ${options.name}-changes.patch`);
          logger.info(`   You can use: git apply --reject ${options.name}-changes.patch`);
        }

        // ===== VOLVER AL BRANCH ORIGINAL =====
        if (currentBranch && currentBranch !== 'develop') {
          execSync(`git checkout ${currentBranch}`, { stdio: 'inherit' });
          logger.info(`✓ Returned to original branch: ${currentBranch}`);

          if (stashCreated) {
            logger.info('Applying stashed changes...');
            execSync('git stash pop', { stdio: 'inherit' });
            logger.info('✓ Original changes restored');
          }
        }

        // Limpiar directorio temporal
        logger.info('Cleaning up temporary directory...');
        fs.rmSync(tempDir, { recursive: true, force: true });

        const action = projectExists ? 'updated' : 'created';
        logger.info(`✅ ${options.type} ${options.projectType} ${options.name} ${action} successfully!`);

        // Instalar dependencias
        installPackagesTask(tree);
      } catch (error) {
        logger.error(`❌ Git operations failed: ${error instanceof Error ? error.message : String(error)}`);

        try {
          // Intentar volver al branch original
          if (currentBranch) {
            execSync(`git checkout ${currentBranch}`, { stdio: 'ignore' });
            logger.info(`Returned to original branch: ${currentBranch}`);

            // Intentar recuperar el stash si existe
            try {
              const hasStash = execSync('git stash list | grep "Temporary stash for haijin generator"', { stdio: 'ignore', encoding: 'utf8' }).trim().length > 0;
              if (hasStash) {
                logger.info('Applying stashed changes after error...');
                execSync('git stash pop', { stdio: 'ignore' });
                logger.info('✓ Original changes restored');
              }
            } catch (e) {
              // Si el comando grep falla, no hay stash o hay otro problema
            }
          }

          // Limpiar directorio temporal si existe
          const homeDir = require('os').homedir();
          const tempDir = path.join(homeDir, '.haijin-temp-files');
          if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
          }
        } catch (e) {
          logger.error(`Failed to clean up: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    };
  } catch (error) {
    logger.error(`Failed to ${projectExists ? 'update' : 'create'} ${options.type} ${options.projectType}: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}
