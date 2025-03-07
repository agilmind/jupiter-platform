import { Tree, formatFiles, logger, installPackagesTask, generateFiles } from '@nx/devkit';
import { execSync } from 'child_process';
import { validateHaikuGitState, createAndCheckoutBranch, hasUncommittedChanges, commit } from './git';

export interface AddServiceOptions {
  name: string;
  type: string;
  dependencies?: {
    prod?: string[];
    dev?: string[];
  };
  templatePath: string;
  projectUpdates?: (serviceDir: string) => void;
}

export async function generateService(
  tree: Tree,
  options: AddServiceOptions
) {
  // 1. Verificar estado de Git
  const gitStatus = validateHaikuGitState();
  if (!gitStatus.valid) {
    logger.error(gitStatus.message);
    return;
  }

  const serviceName = options.name;
  const projectName = `services-${serviceName}`;
  const serviceDir = `services/${serviceName}`;

  logger.info(`Adding ${options.type} service: ${serviceName}`);

  try {
    // 2. Trabajar en branch base
    createAndCheckoutBranch('base');
    logger.info('Switched to base branch');

    // 3. Crear un proyecto NX
    execSync(`npx nx g @nx/node:app ${projectName} --directory=${serviceDir} --no-interactive`, { stdio: 'inherit' });

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

    // 5. Generar archivos desde templates usando generateFiles de NX estándar
    generateFiles(
      tree,
      options.templatePath,
      serviceDir,
      {
        ...options,
        template: '',
        dot: '.' // Para archivos que comienzan con .
      }
    );

    // 6. Aplicar actualizaciones específicas
    if (options.projectUpdates) {
      options.projectUpdates(serviceDir);
    }

    // 7. Formatear y aplicar cambios
    await formatFiles(tree);

    // 8. Git: add y commit
    logger.info('Adding all files to Git...');
    execSync('git add --all', { stdio: 'inherit' });

    if (hasUncommittedChanges()) {
      commit(`Add ${options.type} service: ${serviceName}`);
      logger.info(`Changes committed to base branch`);
    }

    // 9. Merge a develop
    createAndCheckoutBranch('develop');
    logger.info('Switched to develop branch');

    execSync('git merge base -X theirs', { stdio: 'inherit' });
    logger.info('Successfully merged from base to develop');

    if (hasUncommittedChanges()) {
      commit(`Complete ${options.type} service setup: ${serviceName}`);
    }

    return () => {
      installPackagesTask(tree);
    };
  } catch (error) {
    try {
      createAndCheckoutBranch('develop');
      execSync('git add --all', { stdio: 'ignore' });
    } catch (gitError) {
      // Ignorar errores de Git
    }

    logger.error(`Failed to create ${options.type} service: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}
