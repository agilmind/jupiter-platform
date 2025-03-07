import { Tree, formatFiles, logger, installPackagesTask, generateFiles } from '@nx/devkit';
import { execSync } from 'child_process';
import { AddApolloPrismaGeneratorSchema } from './schema';
import * as path from 'path';
import * as fs from 'fs';
import {
  validateHaikuGitState,
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

  logger.info(`Adding minimal Apollo+Prisma service: ${serviceName}`);

  try {
    // Paso 1: Trabajar en branch base
    createAndCheckoutBranch('base');
    logger.info('Switched to base branch');

    // CORRECCIÓN CLAVE: cambiar cómo llamamos al generador
    // El formato correcto es: nombre-app --directory=carpeta
    // Esto creará carpeta/nombre-app
    execSync(`npx nx g @nx/node:app ${serviceName} --directory=services --no-interactive`, { stdio: 'inherit' });

    // La estructura esperada ahora es:
    const projectRoot = `services/${serviceName}`;

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
    const prismaDir = `${projectRoot}/prisma`;
    if (!tree.exists(prismaDir)) {
      tree.write(`${prismaDir}/.gitkeep`, '');
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

    tree.write(`${prismaDir}/schema.prisma`, prismaSchema);

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
    logger.info('Ensuring all files exist in the filesystem...');

    // Crear un script shell con las rutas CORREGIDAS
    const ensureFilesScript = `
#!/bin/bash
set -e

# Verificar que la carpeta existe
if [ ! -d "${projectRoot}" ]; then
  echo "Error: La carpeta ${projectRoot} no existe"
  exit 1
fi

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

# Verificar si existe server.ts
if [ ! -f "${projectRoot}/src/server.ts" ]; then
  cat > ${projectRoot}/src/server.ts << 'EOL'
import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { PrismaClient } from '@prisma/client';

// Initialize Prisma client
const prisma = new PrismaClient();

// Define a simple schema
const typeDefs = \`#graphql
  type Query {
    hello: String
  }
\`;

// Define resolvers
const resolvers = {
  Query: {
    hello: () => 'Hello World from Apollo Server!',
  },
};

async function bootstrap() {
  // Create Apollo server
  const server = new ApolloServer({
    typeDefs,
    resolvers,
  });

  // Start the server
  const { url } = await startStandaloneServer(server, {
    context: async () => ({ prisma }),
    listen: { port: parseInt(process.env.PORT || '4000') }
  });

  console.log(\`🚀 Server ready at \${url}\`);
  console.log(\`Try your first query: { hello }\`);
}

bootstrap().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
EOL
  echo "Created missing file: ${projectRoot}/src/server.ts"
fi

# Añadir explícitamente los archivos a Git
git add ${projectRoot}/prisma/.gitkeep
git add ${projectRoot}/prisma/schema.prisma
git add ${projectRoot}/src/server.ts

echo "All files verified and added to Git"
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
