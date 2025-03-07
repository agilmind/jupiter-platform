import { Tree, formatFiles, logger } from '@nx/devkit';
import { execSync } from 'child_process';
import { AddApolloPrismaGeneratorSchema } from './schema';

export async function addApolloPrismaGenerator(
  tree: Tree,
  options: AddApolloPrismaGeneratorSchema
) {
  const appName = options.name;

  logger.info(`Adding Apollo Prisma application: ${appName}`);
  try {
    execSync(`npx nx g @nx/apollo-prisma:app ${appName}`, { stdio: 'inherit' });

    // Opcionalmente puedes añadir configuraciones específicas para la app

    await formatFiles(tree);

    logger.info(`Apollo Prisma application ${appName} added successfully!`);
  } catch (error) {
    logger.error(`Failed to add Apollo Prisma application ${appName}: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

export default addApolloPrismaGenerator;
