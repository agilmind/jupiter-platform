import { Tree, formatFiles, logger, installPackagesTask, generateFiles } from '@nx/devkit';
import { execSync } from 'child_process';
import { AddApolloPrismaGeneratorSchema } from './schema';
import * as path from 'path';
import {
  validateHaikuGitState,
  getCurrentBranch,
  createAndCheckoutBranch,
  hasUncommittedChanges,
  addFiles,
  commit
} from '../../utils/git';

export async function addApolloPrismaGenerator(
  tree: Tree,
  options: AddApolloPrismaGeneratorSchema
) {
  // 1. Verificar estado de Git
  const gitStatus = validateHaikuGitState();
  if (!gitStatus.valid) {
    logger.error(gitStatus.message);
    return;
  }

  const serviceName = options.name;
  const projectRoot = `services/${serviceName}`;

  logger.info(`Adding minimal Apollo+Prisma service: ${serviceName}`);

  try {
    // 2. Hacer checkout al branch base
    createAndCheckoutBranch('base');
    logger.info('Switched to base branch');

    // 3. Crear el servicio en el branch base
    execSync(`npx nx g @nx/node:app ${serviceName} --directory=services --no-interactive`, { stdio: 'inherit' });

    // 4. Instalar dependencias
    logger.info('Installing dependencies...');
    execSync(`npm install @apollo/server graphql @prisma/client --save --legacy-peer-deps`, { stdio: 'inherit' });
    execSync(`npm install prisma --save-dev --legacy-peer-deps`, { stdio: 'inherit' });

    // 5. Generar archivos
    generateFiles(
      tree,
      path.join(__dirname, '../files/apollo-prisma/src'),
      `services/${serviceName}/src`,
      {
        ...options,
        template: '',
      }
    );

    // 6. Crear la carpeta prisma y su schema
    if (!tree.exists(`services/${serviceName}/prisma`)) {
      tree.write(`services/${serviceName}/prisma/.gitkeep`, '');
    }

    const prismaSchema = `
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}
`;

    tree.write(`services/${serviceName}/prisma/schema.prisma`, prismaSchema);

    // Aplicar los cambios del Tree y esperar a que se escriban en disco
    await formatFiles(tree);

    // 7. CRÍTICO: Asegurarse de añadir todos los archivos - CORREGIDO
    logger.info('Adding all generated files to Git...');
    execSync('git add --all', { stdio: 'inherit' });

    // 8. Verificar si hay cambios para confirmar
    if (hasUncommittedChanges()) {
      logger.info('Changes detected, creating commit...');
      // No es necesario llamar a addFiles() ya que ya hemos hecho git add --all
      commit(`Add Apollo+Prisma service: ${serviceName}`);
      logger.info(`Changes committed to base branch`);
    } else {
      logger.info('No changes to commit');
    }

    // 9. Intentar merge a develop
    try {
      createAndCheckoutBranch('develop');
      logger.info('Switched to develop branch');

      // Uso de estrategia de merge recursiva y theirs para evitar conflictos
      execSync('git merge base -X theirs', { stdio: 'inherit' });
      logger.info('Successfully merged changes from base to develop');
    } catch (mergeError) {
      logger.error('Merge conflict detected. Please resolve conflicts manually.');
      logger.info('You are now in the develop branch with the merge conflicts.');
      logger.info('After resolving conflicts, commit your changes and continue.');
    }

    logger.info(`✅ Apollo+Prisma service ${serviceName} created successfully!`);
    logger.info('');
    logger.info('Next steps:');
    logger.info(`1. Run: npx nx serve services-${serviceName}`);
    logger.info(`2. Open http://localhost:4000 in your browser`);

    return () => {
      installPackagesTask(tree);
    };
  } catch (error) {
    // En caso de error, intentamos volver al branch develop
    try {
      createAndCheckoutBranch('develop');
    } catch (gitError) {
      // Ignoramos errores al intentar volver a develop
    }

    logger.error(`Failed to create Apollo+Prisma service: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

export default addApolloPrismaGenerator;
