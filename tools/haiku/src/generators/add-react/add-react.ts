import { Tree, formatFiles, logger } from '@nx/devkit';
import { execSync } from 'child_process';
import { AddReactGeneratorSchema } from './schema';

export async function addReactGenerator(
  tree: Tree,
  options: AddReactGeneratorSchema
) {
  const appName = options.name;

  logger.info(`Adding React application: ${appName}`);
  try {
    execSync(`npx nx g @nx/react:app ${appName}`, { stdio: 'inherit' });

    // Opcionalmente puedes añadir configuraciones específicas para la app

    await formatFiles(tree);

    logger.info(`React application ${appName} added successfully!`);
  } catch (error) {
    logger.error(`Failed to add React application ${appName}: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

export default addReactGenerator;
