import { Tree, formatFiles, logger } from '@nx/devkit';
import { execSync } from 'child_process';
import { AddReactNativeGeneratorSchema } from './schema';

export async function addReactNativeGenerator(
  tree: Tree,
  options: AddReactNativeGeneratorSchema
) {
  const appName = options.name;

  logger.info(`Adding React Native application: ${appName}`);
  try {
    execSync(`npx nx g @nx/react-native:app ${appName}`, { stdio: 'inherit' });

    // Opcionalmente puedes añadir configuraciones específicas para la app

    await formatFiles(tree);

    logger.info(`React Native application ${appName} added successfully!`);
  } catch (error) {
    logger.error(`Failed to add React Native application ${appName}: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

export default addReactNativeGenerator;
