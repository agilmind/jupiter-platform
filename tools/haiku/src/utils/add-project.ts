// tools/haiku/src/utils/add-project.ts
import { Tree, formatFiles, logger, installPackagesTask, generateFiles } from '@nx/devkit';
import { execSync } from 'child_process';
import * as path from 'path';
import { validateHaikuGitState, createAndCheckoutBranch, hasUncommittedChanges, commit } from './git';

export interface AddProjectOptions {
  name: string;
  type: string;
  projectType: 'app' | 'service';  // Indica si es una app o un servicio
  generator: string;               // El generador NX a usar (ej: '@nx/node:app')
  dependencies?: {
    prod?: string[];
    dev?: string[];
  };
  templatePath: string;
  projectUpdates?: (projectDir: string, projectName: string) => void;
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

  logger.info(`Adding ${options.type} ${options.projectType}: ${options.name}`);

  try {
    // 2. Cambiar a branch base
    createAndCheckoutBranch('base');
    logger.info('Switched to base branch');

    // 3. Generar proyecto con NX
    execSync(`npx nx g ${options.generator} ${projectName} --directory=${projectDir} --no-interactive`, { stdio: 'inherit' });

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

    // 5. Generar archivos específicos desde templates
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

    // 6. Aplicar actualizaciones específicas
    if (options.projectUpdates) {
      options.projectUpdates(projectDir, projectName);
    }

    // 7. Formatear y escribir cambios a disco
    await formatFiles(tree);

    // 8. IMPORTANTE: Devolvemos una función task que se ejecutará después de escribir todo a disco
    // Esta es la clave para asegurar que git add capture todos los archivos generados
    return () => {
      // Git: add y commit
      logger.info('Adding all generated files to Git...');
      execSync('git add --all', { stdio: 'inherit' });

      if (hasUncommittedChanges()) {
        commit(`Add ${options.type} ${options.projectType}: ${options.name}`);
        logger.info(`Changes committed to base branch`);
      }

      // Merge a develop
      createAndCheckoutBranch('develop');
      logger.info('Switched to develop branch');

      execSync('git merge base -X theirs', { stdio: 'inherit' });
      logger.info('Successfully merged from base to develop');

      if (hasUncommittedChanges()) {
        commit(`Complete ${options.type} ${options.projectType} setup: ${options.name}`);
      }

      logger.info(`✅ ${options.type} ${options.projectType} ${options.name} created successfully!`);

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

    logger.error(`Failed to create ${options.type} ${options.projectType}: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}
