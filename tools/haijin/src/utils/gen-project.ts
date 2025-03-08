import { formatFiles, generateFiles, installPackagesTask, logger, OverwriteStrategy, Tree } from '@nx/devkit';
import { execSync } from 'child_process';
import { Git } from './gitShell';
import * as fs from 'fs';
import { cleanDirectoryExcept } from './forced-overwrite';

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
  cwd?: string; // Añadimos esta opción para poder especificar el directorio de trabajo
}


export async function generateProject(
  tree: Tree,
  options: AddProjectOptions
) {
  // Inicializamos una instancia de Git con el directorio de trabajo
  const git = new Git(options.cwd || process.cwd());

  // 1. Validar estado de Git usando la clase Git
  // Este es el primer paso de la migración
  const gitStatus = await git.validateHaijinGitStateWithGit();
  if (!gitStatus.valid) {
    logger.error(gitStatus.message);
    return;
  }

  // Determinar directorio y nombre de proyecto
  const directoryPrefix = options.projectType === 'app' ? 'apps' : 'services';
  const projectPrefix = options.projectType === 'app' ? 'app' : 'services';

  const projectDir = `${directoryPrefix}/${options.name}`;
  const projectName = `${projectPrefix}-${options.name}`;

  // El resto del código se mantiene igual por ahora
  // ...resto del código sin cambios...

  // 2. Cambiar a branch base usando la clase Git
  await git.createAndCheckoutBranchWithGit('base');
  // El log ya está incluido en la función adaptadora

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
      // await git.prepareForGenerationWithGit(projectDir);
      await git.prepareForGeneration(projectDir);
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

    // if (projectExists) {
    //   logger.info('Cleaning destination directory before generation...');
    //   cleanDirectoryExcept(tree, projectDir, []);
    // }

    // 5. Generar archivos específicos
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

    // 6. Aplicar actualizaciones específicas
    if (options.projectUpdates) {
      options.projectUpdates(projectDir, projectName);
    }

    // 7. Formatear y escribir cambios
    await formatFiles(tree);

    // 8. Función de task
    return async () => {
      // Git: add y commit usando la clase Git
      logger.info('Adding all generated files to Git...');

      if (await git.hasUncommittedChangesWithGit) {
        const action = projectExists ? 'Update' : 'Add';
        await git.commitWithGit(`${action} ${options.type} ${options.projectType}: ${options.name}`);
        logger.info(`Changes committed to base branch`);
      }

      // Merge a develop usando la clase Git
      await git.createAndCheckoutBranchWithGit('develop');

      // Usamos la función de merge del adaptador
      await git.mergeWithGit('base', ['-X', 'theirs']);

      if (await git.hasUncommittedChangesWithGit()) {
        const action = projectExists ? 'Update' : 'Complete';
        await git.commitWithGit(`${action} ${options.type} ${options.projectType} setup: ${options.name}`);
      }

      const action = projectExists ? 'updated' : 'created';
      logger.info(`✅ ${options.type} ${options.projectType} ${options.name} ${action} successfully!`);

      // Instalar dependencias
      installPackagesTask(tree);

      if (gitStatus.originalBranch) {
        await git.setCurrentBranchWithGit(gitStatus.originalBranch);
      }
    };
  } catch (error) {
    try {
      await git.createAndCheckoutBranchWithGit('develop');
      // No necesitamos 'git add' aquí, pues commitWithGit ya hace el add
    } catch {
      // Ignorar errores de Git
    }

    logger.error(`Failed to ${projectExists ? 'update' : 'create'} ${options.type} ${options.projectType}: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}
