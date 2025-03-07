import { Tree, formatFiles, logger, installPackagesTask } from '@nx/devkit';
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
  const projectName = `services-${serviceName}`;  // Nombre del proyecto en NX
  const serviceDir = `services/${serviceName}`;    // Directorio físico

  logger.info(`Adding minimal Apollo+Prisma service: ${serviceName}`);

  try {
    // Paso 1: Trabajar en branch base
    createAndCheckoutBranch('base');
    logger.info('Switched to base branch');

    // Paso 2: Crear un proyecto NX para este servicio específico
    execSync(`npx nx g @nx/node:app ${projectName} --directory=${serviceDir} --no-interactive`, { stdio: 'inherit' });

    // Instalar dependencias
    logger.info('Installing dependencies...');
    execSync(`npm install @apollo/server graphql @prisma/client --save --legacy-peer-deps`, { stdio: 'inherit' });
    execSync(`npm install prisma --save-dev --legacy-peer-deps`, { stdio: 'inherit' });

    // Paso 3: Crear estructura específica para Apollo+Prisma
    if (!fs.existsSync(`${serviceDir}/prisma`)) {
      fs.mkdirSync(`${serviceDir}/prisma`, { recursive: true });
    }

    // Contenido de server.ts
    const serverContent = `
import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { PrismaClient } from '@prisma/client';

// Initialize Prisma client
const prisma = new PrismaClient();

// Define a simple schema for ${serviceName}
const typeDefs = \`#graphql
  type Query {
    hello: String
  }
\`;

// Define resolvers
const resolvers = {
  Query: {
    hello: () => 'Hello World from ${serviceName} Apollo Server!',
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
`;

    // Contenido de .env
    const envContent = `DATABASE_URL="file:./dev.db"`;

    // Contenido de schema.prisma
    const prismaSchema = `
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}
`;

    // Escribir archivo server.ts (reemplazar main.ts)
    fs.writeFileSync(`${serviceDir}/src/server.ts`, serverContent);

    // Cambiar la referencia en project.json de main.ts a server.ts
    const projectJsonPath = `${serviceDir}/project.json`;
    if (fs.existsSync(projectJsonPath)) {
      const projectJson = JSON.parse(fs.readFileSync(projectJsonPath, 'utf8'));

      // Actualizar build.options.main para usar server.ts en lugar de main.ts
      if (projectJson.targets?.build?.options?.main) {
        projectJson.targets.build.options.main = projectJson.targets.build.options.main.replace('main.ts', 'server.ts');
      }

      // Añadir configuración para prisma
      if (projectJson.targets) {
        projectJson.targets['prisma-generate'] = {
          "executor": "@nx/js:node",
          "options": {
            "command": "npx prisma generate",
            "cwd": serviceDir
          }
        };

        projectJson.targets['prisma-migrate'] = {
          "executor": "@nx/js:node",
          "options": {
            "command": "npx prisma migrate dev",
            "cwd": serviceDir
          }
        };
      }

      // Guardar project.json actualizado
      fs.writeFileSync(projectJsonPath, JSON.stringify(projectJson, null, 2));
    }

    // Escribir archivos específicos de Prisma
    fs.writeFileSync(`${serviceDir}/.env`, envContent);
    fs.writeFileSync(`${serviceDir}/prisma/schema.prisma`, prismaSchema);
    fs.writeFileSync(`${serviceDir}/prisma/.gitkeep`, '');

    // Añadir archivos a Git
    logger.info('Adding all files to Git in base branch...');
    execSync('git add --all', { stdio: 'inherit' });

    // Commit en base
    if (hasUncommittedChanges()) {
      commit(`Add Apollo+Prisma service: ${serviceName}`);
      logger.info(`Changes committed to base branch`);
    }

    // Paso 4: Merge a develop
    createAndCheckoutBranch('develop');
    logger.info('Switched to develop branch');

    execSync('git merge base -X theirs', { stdio: 'inherit' });
    logger.info('Successfully merged from base to develop');

    // Verificar si hay cambios para commit en develop
    if (hasUncommittedChanges()) {
      commit(`Complete Apollo+Prisma service setup: ${serviceName}`);
      logger.info('Additional files committed to develop branch');
    }

    logger.info(`✅ Apollo+Prisma service ${serviceName} created successfully!`);
    logger.info('');
    logger.info('Next steps:');
    logger.info(`1. Run: npx nx serve ${projectName}`);
    logger.info(`2. Open http://localhost:4000 in your browser`);
    logger.info(`3. Generate Prisma client: npx nx run ${projectName}:prisma-generate`);

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
