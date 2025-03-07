import { Tree, formatFiles, logger, installPackagesTask, generateFiles } from '@nx/devkit';
import { execSync } from 'child_process';
import { AddApolloPrismaGeneratorSchema } from './schema';
import * as path from 'path';
import * as fs from 'fs';
import {
  validateHaikuGitState,
  getCurrentBranch,
  createAndCheckoutBranch,
  hasUncommittedChanges,
  commit
} from '../../utils/git';

export async function addApolloPrismaGenerator(
  tree: Tree,
  options: AddApolloPrismaGeneratorSchema
) {
  // Verificar estado de Git
  const gitStatus = validateHaikuGitState();
  if (!gitStatus.valid) {
    logger.error(gitStatus.message);
    return;
  }

  const serviceName = options.name;
  const projectRoot = `services/${serviceName}`;

  logger.info(`Adding minimal Apollo+Prisma service: ${serviceName}`);

  try {
    // Paso 1: Trabajar en branch base
    createAndCheckoutBranch('base');
    logger.info('Switched to base branch');

    // Crear app Node.js base
    execSync(`npx nx g @nx/node:app ${serviceName} --directory=services --no-interactive`, { stdio: 'inherit' });

    // Instalar dependencias
    logger.info('Installing dependencies...');
    execSync(`npm install @apollo/server graphql @prisma/client --save --legacy-peer-deps`, { stdio: 'inherit' });
    execSync(`npm install prisma --save-dev --legacy-peer-deps`, { stdio: 'inherit' });

    // Aplicar cambios a través del Tree API
    generateFiles(
      tree,
      path.join(__dirname, '../files/apollo-prisma/src'),
      `${projectRoot}/src`,
      { ...options, template: '' }
    );

    // Crear carpeta prisma y archivos
    if (!tree.exists(`${projectRoot}/prisma`)) {
      tree.write(`${projectRoot}/prisma/.gitkeep`, '');
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

    tree.write(`${projectRoot}/prisma/schema.prisma`, prismaSchema);

    // Aplicar los cambios del Tree
    await formatFiles(tree);

    // Añadir todos los archivos a Git
    logger.info('Adding all files to Git in base branch...');
    execSync('git add --all', { stdio: 'inherit' });

    // Commit en base
    if (hasUncommittedChanges()) {
      commit(`Add Apollo+Prisma service: ${serviceName}`);
      logger.info(`Changes committed to base branch`);
    }

    // Paso 2: Cambiar a develop y hacer merge
    createAndCheckoutBranch('develop');
    logger.info('Switched to develop branch');

    // Merge desde base
    execSync('git merge base -X theirs', { stdio: 'inherit' });
    logger.info('Successfully merged from base to develop');

    // PASO CRUCIAL: Asegurar que los archivos generados por el Tree API existan
    // Este paso es necesario porque estos archivos a veces no se transfieren correctamente en el merge
    logger.info('Ensuring all files exist in the filesystem...');

    // Crear un script shell para asegurar la creación y seguimiento de los archivos
    const ensureFilesScript = `
#!/bin/bash
set -e

# Asegurar que existe la estructura de directorios
mkdir -p ${projectRoot}/prisma
mkdir -p ${projectRoot}/src

# Verificar y recrear archivos si no existen
if [ ! -f "${projectRoot}/prisma/.gitkeep" ]; then
  touch ${projectRoot}/prisma/.gitkeep
  echo "Created missing file: ${projectRoot}/prisma/.gitkeep"
fi

if [ ! -f "${projectRoot}/prisma/schema.prisma" ]; then
  cat > ${projectRoot}/prisma/schema.prisma << 'EOL'
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}
EOL
  echo "Created missing file: ${projectRoot}/prisma/schema.prisma"
fi

# Añadir explícitamente los archivos a Git
git add ${projectRoot}/prisma/.gitkeep
git add ${projectRoot}/prisma/schema.prisma
git add ${projectRoot}/src/*.ts

# Mostrar estado
git status
`;

    // Escribir el script a un archivo temporal
    const scriptPath = '/tmp/ensure-apollo-files.sh';
    fs.writeFileSync(scriptPath, ensureFilesScript);
    fs.chmodSync(scriptPath, '755');

    // Ejecutar el script
    execSync(scriptPath, { stdio: 'inherit' });

    // Verificar si hay cambios sin confirmar y crear commit si es necesario
    if (hasUncommittedChanges()) {
      commit(`Ensure all Apollo+Prisma service files: ${serviceName}`);
      logger.info('Additional files committed to develop branch');
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
    // En caso de error, intentar volver a develop
    try {
      createAndCheckoutBranch('develop');
      execSync('git add --all', { stdio: 'ignore' });
    } catch (gitError) {
      // Ignorar errores de Git
    }

    logger.error(`Failed to create Apollo+Prisma service: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

export default addApolloPrismaGenerator;
