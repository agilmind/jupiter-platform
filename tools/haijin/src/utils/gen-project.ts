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

      // VERIFICACIÓN CRÍTICA: No continuar si hay cambios sin commit
      const hasUncommittedChanges = execSync('git status --porcelain', { encoding: 'utf8' }).trim().length > 0;
      if (hasUncommittedChanges) {
        logger.error('❌ ERROR: Cannot proceed with uncommitted changes. Please commit or stash your changes first.');
        return;
      }

      try {
        // Verificar si existe y crear el directorio temporal para los archivos generados
        const tempDir = path.join(process.cwd(), '.tmp-haijin-generated');
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }

        // Copiar los archivos generados a un directorio temporal
        logger.info(`Copying generated files to temporary directory...`);
        execSync(`cp -r ${projectDir}/* ${tempDir}/`, { stdio: 'inherit' });

        // ===== PASO SEGURO A BASE =====
        // Verificar si existe la rama base, si no, crearla desde el branch actual
        const branchExists = execSync('git branch --list base', { encoding: 'utf8' }).trim().length > 0;

        if (branchExists) {
          execSync('git checkout base', { stdio: 'inherit' });
        } else {
          execSync('git checkout -b base', { stdio: 'inherit' });
        }
        logger.info('✓ Switched to base branch');

        // Asegurarse de que estamos realmente en el branch base
        const actualBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
        if (actualBranch !== 'base') {
          throw new Error(`Failed to switch to base branch! Currently on ${actualBranch}`);
        }

        // Asegúrate de que existe el directorio del proyecto en base
        if (!fs.existsSync(projectDir)) {
          fs.mkdirSync(projectDir, { recursive: true });
        }

        // Copiar los archivos del directorio temporal al proyecto
        logger.info(`Copying files to ${projectDir} in base branch...`);
        execSync(`cp -r ${tempDir}/* ${projectDir}/`, { stdio: 'inherit' });

        // Añadir y hacer commit de los archivos
        logger.info(`Adding generated files in ${projectDir}...`);
        execSync(`git add ${projectDir}`, { stdio: 'inherit' });

        const gitStatus = execSync('git status --porcelain', { encoding: 'utf8' });
        if (gitStatus.trim().length > 0) {
          const action = projectExists ? 'Update' : 'Add';
          execSync(`git commit -m "${action} ${options.type} ${options.projectType}: ${options.name}"`, { stdio: 'inherit' });
          logger.info(`✓ Changes committed to base branch`);
        } else {
          logger.info(`No changes detected in ${projectDir}`);
        }

        // ===== MERGE A DEVELOP =====
        // Verificar si existe la rama develop, si no, crearla
        const developExists = execSync('git branch --list develop', { encoding: 'utf8' }).trim().length > 0;

        if (developExists) {
          execSync('git checkout develop', { stdio: 'inherit' });
        } else {
          execSync('git checkout -b develop', { stdio: 'inherit' });
        }
        logger.info('✓ Switched to develop branch');

        // Merge desde base con estrategia "theirs"
        execSync('git merge base -X theirs', { stdio: 'inherit' });
        logger.info('✓ Successfully merged from base to develop');

        // Verificar si hay cambios no commiteados después del merge
        const gitStatus2 = execSync('git status --porcelain', { encoding: 'utf8' });
        if (gitStatus2.trim().length > 0) {
          const action = projectExists ? 'Update' : 'Complete';
          execSync(`git commit -m "${action} ${options.type} ${options.projectType} setup: ${options.name}"`, { stdio: 'inherit' });
        }

        // ===== VOLVER AL BRANCH ORIGINAL =====
        if (currentBranch && currentBranch !== 'develop') {
          execSync(`git checkout ${currentBranch}`, { stdio: 'inherit' });
          logger.info(`✓ Returned to original branch: ${currentBranch}`);
        }

        // Limpiar directorio temporal
        if (fs.existsSync(tempDir)) {
          fs.rmSync(tempDir, { recursive: true, force: true });
        }

        const action = projectExists ? 'updated' : 'created';
        logger.info(`✅ ${options.type} ${options.projectType} ${options.name} ${action} successfully!`);

        // Instalar dependencias
        installPackagesTask(tree);
      } catch (error) {
        logger.error(`❌ Git operations failed: ${error instanceof Error ? error.message : String(error)}`);

        // Intentar limpiar y restaurar estado
        try {
          // Limpiar directorio temporal si existe
          const tempDir = path.join(process.cwd(), '.tmp-haijin-generated');
          if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
          }

          // Volver al branch original
          if (currentBranch) {
            execSync(`git checkout ${currentBranch}`, { stdio: 'ignore' });
            logger.info(`Returned to original branch: ${currentBranch}`);
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
