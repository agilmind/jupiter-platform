import { Tree, formatFiles, logger, installPackagesTask, generateFiles } from '@nx/devkit';
import { execSync } from 'child_process';
import { validateHaikuGitState, createAndCheckoutBranch, hasUncommittedChanges, commit } from './git';
import * as fs from 'fs';

export interface AddProjectOptions {
  name: string;
  type: string;
  projectType: 'app' | 'service';
  generator: string;
  dependencies?: {
    prod?: string[];
    dev?: string[];
  };
  templatePath: string;
  projectUpdates?: (projectDir: string, projectName: string) => void;
  update?: boolean;  // Indica si estamos explícitamente en modo actualización
}

export async function generateProject(
  tree: Tree,
  options: AddProjectOptions
) {
  // 1. Validar estado de Git
  const gitStatus = validateHaikuGitState();
  if (!gitStatus.valid) {
    logger.error(gitStatus.message);
    return;
  }

  // Determinar directorio y nombre de proyecto según el tipo
  const directoryPrefix = options.projectType === 'app' ? 'apps' : 'services';
  const projectPrefix = options.projectType === 'app' ? 'app' : 'services';

  const projectDir = `${directoryPrefix}/${options.name}`;
  const projectName = `${projectPrefix}-${options.name}`;

  // Verificar si el proyecto ya existe físicamente
  const projectDirExists = fs.existsSync(projectDir);

  // Si existe y no está en modo update, preguntar al usuario
  if (projectDirExists && !options.update) {
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
    // 2. Cambiar a branch base
    createAndCheckoutBranch('base');
    logger.info('Switched to base branch');

    // 3. Manejo de proyecto existente
    let needToCreateProject = true;

    if (projectDirExists) {
      logger.info(`Handling existing project...`);

      // 3.1 Primero eliminar el proyecto de NX
      try {
        execSync(`npx nx g @nx/workspace:remove ${projectName} --forceRemove`, { stdio: 'inherit' });
        logger.info(`Removed project from NX workspace`);
      } catch (error) {
        logger.warn(`Could not remove project from NX workspace, continuing anyway`);
      }

      // 3.2 Ahora eliminar el directorio físico
      try {
        execSync(`rm -rf ${projectDir}`, { stdio: 'inherit' });
        logger.info(`Removed project directory ${projectDir}`);
      } catch (error) {
        logger.error(`Failed to remove directory: ${error instanceof Error ? error.message : String(error)}`);
        return;
      }

      // 3.3 Esperar un poco para que el sistema de archivos se actualice
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // 4. Generar un nuevo proyecto
    logger.info(`Creating new project at ${projectDir}...`);
    execSync(`npx nx g ${options.generator} ${projectName} --directory=${projectDir} --no-interactive`, { stdio: 'inherit' });

    // 5. Instalar dependencias
    if (options.dependencies) {
      logger.info('Installing dependencies...');

      if (options.dependencies.prod && options.dependencies.prod.length > 0) {
        execSync(`npm install ${options.dependencies.prod.join(' ')} --save --legacy-peer-deps`, { stdio: 'inherit' });
      }

      if (options.dependencies.dev && options.dependencies.dev.length > 0) {
        execSync(`npm install ${options.dependencies.dev.join(' ')} --save-dev --legacy-peer-deps`, { stdio: 'inherit' });
      }
    }

    // 6. Generar archivos específicos
    logger.info('Generating template files...');
    generateFiles(
      tree,
      options.templatePath,
      projectDir,
      {
        ...options,
        template: '',
        dot: '.'
      }
    );

    // 7. Aplicar actualizaciones específicas
    if (options.projectUpdates) {
      options.projectUpdates(projectDir, projectName);
    }

    // 8. Formatear y escribir cambios
    await formatFiles(tree);

    // 9. Función de task
    return () => {
      // Git: add y commit
      logger.info('Adding all generated files to Git...');
      execSync('git add --all', { stdio: 'inherit' });

      if (hasUncommittedChanges()) {
        const action = projectDirExists ? 'Update' : 'Add';
        commit(`${action} ${options.type} ${options.projectType}: ${options.name}`);
        logger.info(`Changes committed to base branch`);
      }

      // Merge a develop
      createAndCheckoutBranch('develop');
      logger.info('Switched to develop branch');

      execSync('git merge base -X theirs', { stdio: 'inherit' });
      logger.info('Successfully merged from base to develop');

      if (hasUncommittedChanges()) {
        const action = projectDirExists ? 'Update' : 'Complete';
        commit(`${action} ${options.type} ${options.projectType} setup: ${options.name}`);
      }

      const action = projectDirExists ? 'updated' : 'created';
      logger.info(`✅ ${options.type} ${options.projectType} ${options.name} ${action} successfully!`);

      // Instalar dependencias
      installPackagesTask(tree);
    };
  } catch (error) {
    try {
      createAndCheckoutBranch('develop');
      execSync('git add --all', { stdio: 'ignore' });
    } catch (gitError) {
      // Ignorar errores de Git
    }

    logger.error(`Failed to ${projectDirExists ? 'update' : 'create'} ${options.type} ${options.projectType}: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}
