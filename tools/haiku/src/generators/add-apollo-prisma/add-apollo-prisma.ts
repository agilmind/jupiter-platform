import { Tree, logger } from '@nx/devkit';
import * as path from 'path';
import * as fs from 'fs';
import { AddApolloPrismaGeneratorSchema } from './schema';
import { generateService } from '../../utils/add-service';

export async function addApolloPrismaGenerator(
  tree: Tree,
  options: AddApolloPrismaGeneratorSchema
) {
  // Función para actualizar project.json para Apollo+Prisma
  const updateProjectConfig = (serviceDir: string) => {
    const projectJsonPath = `${serviceDir}/project.json`;
    if (fs.existsSync(projectJsonPath)) {
      const projectJson = JSON.parse(fs.readFileSync(projectJsonPath, 'utf8'));

      // Cambiar main.ts a server.ts
      if (projectJson.targets?.build?.options?.main) {
        projectJson.targets.build.options.main = projectJson.targets.build.options.main.replace('main.ts', 'server.ts');
      }

      // Añadir targets de Prisma
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

      fs.writeFileSync(projectJsonPath, JSON.stringify(projectJson, null, 2));
    }
  };

  // Generar el servicio usando la función común
  const result = await generateService(tree, {
    ...options,
    type: 'Apollo+Prisma',
    dependencies: {
      prod: ['@apollo/server', 'graphql', '@prisma/client'],
      dev: ['prisma']
    },
    templatePath: path.join(__dirname, '../../files/apollo-prisma'),
    projectUpdates: updateProjectConfig
  });

  // Instrucciones específicas
  logger.info('Next steps:');
  logger.info(`1. Run: npx nx serve services-${options.name}`);
  logger.info(`2. Open http://localhost:4000 in your browser`);
  logger.info(`3. Generate Prisma client: npx nx run services-${options.name}:prisma-generate`);

  return result;
}

export default addApolloPrismaGenerator;
