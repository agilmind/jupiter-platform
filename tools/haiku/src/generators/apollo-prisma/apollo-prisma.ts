import { logger } from '@nx/devkit';
import * as fs from 'fs';


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
