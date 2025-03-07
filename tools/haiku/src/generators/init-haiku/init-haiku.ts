import {
  Tree,
  formatFiles,
  logger,
} from '@nx/devkit';
import { execSync } from 'child_process';
import { InitHaikuGeneratorSchema } from './schema';
import {
  validateHaikuGitState,
  setupHaikuBranches,
} from '../../utils/git';

// Función auxiliar para verificar estado de Git
function checkGitStatus(): { isMain: boolean; hasChanges: boolean } {
  try {
    // Verificar si estamos en branch main
    const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
    const isMain = currentBranch === 'main';

    // Verificar si hay cambios pendientes
    const status = execSync('git status --porcelain', { encoding: 'utf8' });
    const hasChanges = status.trim() !== '';

    return { isMain, hasChanges };
  } catch (error) {
    logger.error('Failed to check Git status. Make sure Git is installed and this is a Git repository.');
    throw error;
  }
}

// Función para manejar los branches de Git
function handleGitBranches() {
  try {
    // Verificar si existe el branch 'base'
    const branches = execSync('git branch', { encoding: 'utf8' });
    const baseExists = branches.includes('base');

    if (!baseExists) {
      // Crear branch 'base'
      logger.info('Creating base branch...');
      execSync('git checkout -b base', { stdio: 'inherit' });
      execSync('git add .', { stdio: 'inherit' });
      execSync('git commit -m "Initial commit for base branch"', { stdio: 'inherit' });
    }

    // Verificar si existe el branch 'develop'
    const developExists = branches.includes('develop');

    if (!developExists) {
      // Crear branch 'develop'
      logger.info('Creating develop branch...');
      execSync('git checkout -b develop', { stdio: 'inherit' });
    } else {
      // Cambiar a develop si ya existe
      execSync('git checkout develop', { stdio: 'inherit' });
    }

    logger.info('Now on develop branch');
  } catch (error) {
    logger.error(`Failed to manage Git branches: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

// Función para inicializar una aplicación React
async function initReactApp(tree: Tree, appName: string) {
  logger.info(`Initializing React application: ${appName}`);
  try {
    execSync(`npx nx g @nx/react:app ${appName}`, { stdio: 'inherit' });
  } catch (error) {
    logger.error(`Failed to initialize React application ${appName}: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

// Función para inicializar una aplicación React Native
async function initReactNativeApp(tree: Tree, appName: string) {
  logger.info(`Initializing React Native application: ${appName}`);
  try {
    execSync(`npx nx g @nx/react-native:app ${appName}`, { stdio: 'inherit' });
  } catch (error) {
    logger.error(`Failed to initialize React Native application ${appName}: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

// Función para inicializar un servicio Apollo-Prisma
async function initApolloPrismaService(tree: Tree, serviceName: string) {
  logger.info(`Initializing Apollo-Prisma service: ${serviceName}`);
  try {
    // Crear un directorio para el servicio
    const serviceDir = `services/${serviceName}`;
    if (!tree.exists(serviceDir)) {
      tree.write(`${serviceDir}/.gitkeep`, '');
    }

    // Aquí añadiríamos la lógica para inicializar un servicio Apollo-Prisma
    // Por ahora, simplemente generamos un mensaje placeholder
    execSync(`npx nx g @nx/node:app ${serviceName} --directory=services`, { stdio: 'inherit' });

    // Añadir configuración específica de Apollo-Prisma
    // Esta parte se desarrollaría más adelante
  } catch (error) {
    logger.error(`Failed to initialize Apollo-Prisma service ${serviceName}: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

export async function initHaikuGenerator(
  tree: Tree,
  options: InitHaikuGeneratorSchema
) {
  // Verificar estado de Git
  const gitStatus = validateHaikuGitState();

  if (!gitStatus.valid) {
    logger.error(gitStatus.message);
    return;
  }

  // Inicializar los tipos de proyectos seleccionados
  if (options.initReact && options.reactAppName) {
    await initReactApp(tree, options.reactAppName);
  }

  // Inicializar los tipos de proyectos seleccionados
  if (options.initReact && options.reactAppName) {
    await initReactApp(tree, options.reactAppName);
  }

  if (options.initReactNative && options.reactNativeAppName) {
    await initReactNativeApp(tree, options.reactNativeAppName);
  }

  if (options.initApolloPrisma && options.apolloPrismaServiceName) {
    await initApolloPrismaService(tree, options.apolloPrismaServiceName);
  }

  // Configurar branches de Git para Haiku
  setupHaikuBranches();

  await formatFiles(tree);

  logger.info('Haiku initialization completed successfully!');
  logger.info('You are now on the "develop" branch. Happy coding!');
}

export default initHaikuGenerator;
