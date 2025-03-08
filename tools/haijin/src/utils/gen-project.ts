import { Tree, formatFiles, logger, installPackagesTask, generateFiles, OverwriteStrategy } from '@nx/devkit';
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
      {overwriteStrategy: OverwriteStrategy.Overwrite}
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
      // Inicializar Git DESPUÉS de que se hayan escrito los archivos
      const git = new Git(options.cwd || process.cwd());

      logger.info('Executing post-generation Git operations...');

      // Obtener el estado actual de Git
      const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();

      // 1. Cambiamos a branch base
      try {
        execSync('git checkout base || git checkout -b base', { stdio: 'inherit' });
        logger.info('Switched to base branch');

        // 2. Add y commit
        execSync('git add --all', { stdio: 'inherit' });

        const gitStatus = execSync('git status --porcelain', { encoding: 'utf8' });
        if (gitStatus.trim().length > 0) {
          const action = projectExists ? 'Update' : 'Add';
          execSync(`git commit -m "${action} ${options.type} ${options.projectType}: ${options.name}"`, { stdio: 'inherit' });
          logger.info(`Changes committed to base branch`);
        }

        // 3. Merge a develop
        execSync('git checkout develop || git checkout -b develop', { stdio: 'inherit' });
        logger.info('Switched to develop branch');

        execSync('git merge base -X theirs', { stdio: 'inherit' });
        logger.info('Successfully merged from base to develop');

        const gitStatus2 = execSync('git status --porcelain', { encoding: 'utf8' });
        if (gitStatus2.trim().length > 0) {
          const action = projectExists ? 'Update' : 'Complete';
          execSync(`git commit -m "${action} ${options.type} ${options.projectType} setup: ${options.name}"`, { stdio: 'inherit' });
        }

        // 4. Volver al branch original
        if (currentBranch && currentBranch !== 'develop') {
          execSync(`git checkout ${currentBranch}`, { stdio: 'inherit' });
          logger.info(`Returned to original branch: ${currentBranch}`);
        }

        const action = projectExists ? 'updated' : 'created';
        logger.info(`✅ ${options.type} ${options.projectType} ${options.name} ${action} successfully!`);

        // Instalar dependencias
        installPackagesTask(tree);
      } catch (error) {
        logger.error(`Git operations failed: ${error instanceof Error ? error.message : String(error)}`);
        // Intenta volver al branch original
        try {
          if (currentBranch) {
            execSync(`git checkout ${currentBranch}`, { stdio: 'ignore' });
          }
        } catch {}
      }
    };
  } catch (error) {
    logger.error(`Failed to ${projectExists ? 'update' : 'create'} ${options.type} ${options.projectType}: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}
