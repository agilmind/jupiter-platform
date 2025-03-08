import { Tree, formatFiles, logger, installPackagesTask, generateFiles } from '@nx/devkit';
import { execSync } from 'child_process';
import { validateHaijinGitState, createAndCheckoutBranch, hasUncommittedChanges, commit } from './git';
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
  update?: boolean;  // Indica si estamos explícitamente en modo actualización
}


export async function generateProject(
  tree: Tree,
  options: AddProjectOptions
) {
  // 1. Validar estado de Git
  const gitStatus = validateHaijinGitState();
  if (!gitStatus.valid) {
    logger.error(gitStatus.message);
    return;
  }

  // Determinar directorio y nombre de proyecto
  const directoryPrefix = options.projectType === 'app' ? 'apps' : 'services';
  const projectPrefix = options.projectType === 'app' ? 'app' : 'services';

  const projectDir = `${directoryPrefix}/${options.name}`;
  const projectName = `${projectPrefix}-${options.name}`;

  // 2. Cambiar a branch base
  createAndCheckoutBranch('base');
  logger.info('Switched to base branch');

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
    if (!projectExists) {
      logger.info(`Creating new project at ${projectDir}...`);
    } else {
      logger.info(`Project already exists, skipping creation step`);

      // Limpiar el directorio pero preservar project.json y tsconfig.json
      logger.info(`Cleaning project directory...`);
      // Limpiar archivos pero no el directorio en sí
      const files = fs.readdirSync(projectDir);

      for (const file of files) {
        const filePath = path.join(projectDir, file);
        if (fs.lstatSync(filePath).isDirectory()) {
          fs.rmSync(filePath, { recursive: true, force: true });
        } else {
          fs.unlinkSync(filePath);
        }
      }
    }

    // 4. Instalar dependencias
    if (options.dependencies) {
      logger.info('Installing dependencies...');

      if (options.dependencies.prod && options.dependencies.prod.length > 0) {
        execSync(`npm install ${options.dependencies.prod.join(' ')} --save --legacy-peer-deps`, { stdio: 'inherit' });
      }

      if (options.dependencies.dev && options.dependencies.dev.length > 0) {
        execSync(`npm install ${options.dependencies.dev.join(' ')} --save-dev --legacy-peer-deps`, { stdio: 'inherit' });
      }
    }

    // 5. Crear estructura de directorios si no existe
    for (const subDir of ['src', 'src/app', 'prisma']) {
      const fullSubDir = path.join(projectDir, subDir);
      if (!fs.existsSync(fullSubDir)) {
        fs.mkdirSync(fullSubDir, { recursive: true });
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
        const action = projectExists ? 'Update' : 'Add';
        commit(`${action} ${options.type} ${options.projectType}: ${options.name}`);
        logger.info(`Changes committed to base branch`);
      }

      // Merge a develop
      createAndCheckoutBranch('develop');
      logger.info('Switched to develop branch');

      execSync('git merge base -X theirs', { stdio: 'inherit' });
      logger.info('Successfully merged from base to develop');

      if (hasUncommittedChanges()) {
        const action = projectExists ? 'Update' : 'Complete';
        commit(`${action} ${options.type} ${options.projectType} setup: ${options.name}`);
      }

      const action = projectExists ? 'updated' : 'created';
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

    logger.error(`Failed to ${projectExists ? 'update' : 'create'} ${options.type} ${options.projectType}: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}
