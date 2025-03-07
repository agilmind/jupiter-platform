import { Tree, logger } from '@nx/devkit';
import * as path from 'path';
import * as fs from 'fs';
import { AddApolloPrismaGeneratorSchema } from './schema';
import { generateProject } from '../../utils/add-project';


// Función para actualizar project.json para un servicio Apollo+Prisma
export const updateProjectConfig = (projectDir: string, projectName: string) => {
  const projectJsonPath = `${projectDir}/project.json`;

  if (fs.existsSync(projectJsonPath)) {
    try {
      // Leer project.json
      const projectJson = JSON.parse(fs.readFileSync(projectJsonPath, 'utf8'));

      // 1. Cambiar referencia de main.ts a server.ts
      if (projectJson.targets?.build?.options?.main) {
        const mainPath = projectJson.targets.build.options.main;
        projectJson.targets.build.options.main = mainPath.replace('main.ts', 'server.ts');
      }

      // 2. Añadir targets personalizados para Prisma
      if (projectJson.targets) {
        // Añadir comando para generar cliente Prisma
        projectJson.targets['prisma-generate'] = {
          "executor": "@nx/js:node",
          "options": {
            "command": "npx prisma generate",
            "cwd": projectDir
          }
        };

        // Añadir comando para ejecutar migraciones de Prisma
        projectJson.targets['prisma-migrate'] = {
          "executor": "@nx/js:node",
          "options": {
            "command": "npx prisma migrate dev",
            "cwd": projectDir
          }
        };

        // Añadir comando para prisma studio
        projectJson.targets['prisma-studio'] = {
          "executor": "@nx/js:node",
          "options": {
            "command": "npx prisma studio",
            "cwd": projectDir
          }
        };
      }

      // 3. Actualizar tags para facilitar selección en nx affected
      if (!projectJson.tags) {
        projectJson.tags = [];
      }

      if (!projectJson.tags.includes('type:api')) {
        projectJson.tags.push('type:api');
      }

      if (!projectJson.tags.includes('scope:server')) {
        projectJson.tags.push('scope:server');
      }

      // 4. Guardar cambios
      fs.writeFileSync(projectJsonPath, JSON.stringify(projectJson, null, 2));
      logger.info(`Updated project configuration for ${projectName}`);
    } catch (error) {
      logger.error(`Error updating project configuration: ${error instanceof Error ? error.message : String(error)}`);
    }
  } else {
    logger.warn(`Project configuration file not found at ${projectJsonPath}`);
  }
};

// export async function addApolloPrismaGenerator(
//   tree: Tree,
//   options: AddApolloPrismaGeneratorSchema
// ) {
//   // Función para actualizar project.json
//   const updateProjectConfig = (projectDir: string, projectName: string) => {
//     const projectJsonPath = `${projectDir}/project.json`;
//     if (fs.existsSync(projectJsonPath)) {
//       const projectJson = JSON.parse(fs.readFileSync(projectJsonPath, 'utf8'));
//
//       // Cambiar main.ts a server.ts
//       if (projectJson.targets?.build?.options?.main) {
//         projectJson.targets.build.options.main = projectJson.targets.build.options.main.replace('main.ts', 'server.ts');
//       }
//
//       // Añadir targets de Prisma
//       if (projectJson.targets) {
//         projectJson.targets['prisma-generate'] = {
//           "executor": "@nx/js:node",
//           "options": {
//             "command": "npx prisma generate",
//             "cwd": projectDir
//           }
//         };
//
//         projectJson.targets['prisma-migrate'] = {
//           "executor": "@nx/js:node",
//           "options": {
//             "command": "npx prisma migrate dev",
//             "cwd": projectDir
//           }
//         };
//       }
//
//       fs.writeFileSync(projectJsonPath, JSON.stringify(projectJson, null, 2));
//     }
//   };
//
//   // Generar el proyecto
//   const task = await generateProject(tree, {
//     ...options,
//     type: 'Apollo+Prisma',
//     projectType: 'service',  // Especificamos que es un servicio
//     generator: '@nx/node:app',
//     dependencies: {
//       prod: ['@apollo/server', 'graphql', '@prisma/client'],
//       dev: ['prisma']
//     },
//     templatePath: path.join(__dirname, '../files/apollo-prisma'),
//     projectUpdates: updateProjectConfig
//   });
//
//   // Mostrar instrucciones específicas
//   logger.info('Next steps:');
//   logger.info(`1. Run: npx nx serve services-${options.name}`);
//   logger.info(`2. Open http://localhost:4000 in your browser`);
//   logger.info(`3. Generate Prisma client: npx nx run services-${options.name}:prisma-generate`);
//
//   return task;  // Devolvemos la tarea para que NX la ejecute después
// }
//
// export default addApolloPrismaGenerator;
