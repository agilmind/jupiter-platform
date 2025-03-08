import { Tree, formatFiles, logger, installPackagesTask, generateFiles, OverwriteStrategy } from '@nx/devkit';
import { execSync } from 'child_process';
// Importamos la clase Git desde gitShell
import { Git } from './gitShell';
// Importamos los adaptadores
import {
  validateHaijinGitStateWithGit,
  createAndCheckoutBranchWithGit,
  hasUncommittedChangesWithGit,
  commitWithGit,
  setCurrentBranchWithGit,
  prepareForGenerationWithGit,
  mergeWithGit
} from './git-adapter';
// Mantenemos las importaciones de git.ts temporalmente durante la migración
import {
  validateHaijinGitState,
  createAndCheckoutBranch,
  hasUncommittedChanges,
  commit,
  setCurrentBranch,
  prepareForGerneration
} from './git';
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
  const gitStatus = await validateHaijinGitStateWithGit(git);
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
  await createAndCheckoutBranchWithGit(git, 'base');
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
      await prepareForGenerationWithGit(git, projectDir);
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
       { overwrite: true }
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

      if (await hasUncommittedChangesWithGit(git)) {
        const action = projectExists ? 'Update' : 'Add';
        await commitWithGit(git, `${action} ${options.type} ${options.projectType}: ${options.name}`);
        logger.info(`Changes committed to base branch`);
      }

      // Merge a develop usando la clase Git
      await createAndCheckoutBranchWithGit(git, 'develop');

      // Usamos la función de merge del adaptador
      await mergeWithGit(git, 'base', ['-X', 'theirs']);

      if (await hasUncommittedChangesWithGit(git)) {
        const action = projectExists ? 'Update' : 'Complete';
        await commitWithGit(git, `${action} ${options.type} ${options.projectType} setup: ${options.name}`);
      }

      const action = projectExists ? 'updated' : 'created';
      logger.info(`✅ ${options.type} ${options.projectType} ${options.name} ${action} successfully!`);

      // Instalar dependencias
      installPackagesTask(tree);

      if (gitStatus.originalBranch) {
        await setCurrentBranchWithGit(git, gitStatus.originalBranch);
      }
    };
  } catch (error) {
    try {
      await createAndCheckoutBranchWithGit(git, 'develop');
      // No necesitamos 'git add' aquí, pues commitWithGit ya hace el add
    } catch {
      // Ignorar errores de Git
    }

    logger.error(`Failed to ${projectExists ? 'update' : 'create'} ${options.type} ${options.projectType}: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}
