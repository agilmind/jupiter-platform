import { Tree, updateJson } from '@nx/devkit';
import * as path from 'path';
import { GeneratorOptions } from '../../blueprints/types';

export function registerNxProjects(tree: Tree, options: GeneratorOptions): void {
  const { projectName, projectRoot, uniqueAppServerName, uniqueWebAppName } = options;

  // 1. Definir los nombres únicos para los proyectos
  const appServerName = uniqueAppServerName || `${projectName}-app-server`;
  const webAppName = uniqueWebAppName || `${projectName}-web-app`;

  // 2. Actualizar nx.json directamente para registrar los proyectos
  if (tree.exists('nx.json')) {
    updateJson(tree, 'nx.json', (json) => {
      if (!json.projects) {
        json.projects = {};
      }

      // Registrar app-server con nombre único
      json.projects[appServerName] = {
        tags: [],
        root: `apps/${projectName}/app-server`
      };

      // Registrar web-app con nombre único
      json.projects[webAppName] = {
        tags: [],
        root: `apps/${projectName}/web-app`
      };

      return json;
    });
  }

  // 3. Crear project.json para app-server con el nombre correcto
  const appServerProjectJson = {
    name: appServerName,
    sourceRoot: `apps/${projectName}/app-server/src`,
    projectType: "application",
    targets: {
      build: {
        executor: "@nx/js:tsc",
        outputs: ["{options.outputPath}"],
        options: {
          outputPath: `dist/apps/${projectName}/app-server`,
          main: `apps/${projectName}/app-server/src/main.ts`,
          tsConfig: `apps/${projectName}/app-server/tsconfig.app.json`,
          assets: []
        }
      },
      serve: {
        executor: "nx:run-commands",
        options: {
          command: `npx tsx --watch apps/${projectName}/app-server/src/main.ts`
        }
      }
    },
    tags: []
  };

  // Escribir el archivo project.json para app-server
  tree.write(
    path.join(projectRoot, 'app-server', 'project.json'),
    JSON.stringify(appServerProjectJson, null, 2)
  );

  // 4. Crear project.json para web-app con el nombre correcto
  const webAppProjectJson = {
    name: webAppName,
    projectType: "application",
    root: `apps/${projectName}/web-app`,
    targets: {
      serve: {
        executor: "nx:run-commands",
        options: {
          command: `cd apps/${projectName} && docker compose -f docker-compose.dev.yml up web-app`
        }
      }
    },
    tags: []
  };

  // Escribir el archivo project.json para web-app
  tree.write(
    path.join(projectRoot, 'web-app', 'project.json'),
    JSON.stringify(webAppProjectJson, null, 2)
  );

  // 5. Informar sobre los nombres usados
  console.log(`Proyectos registrados como:`);
  console.log(`- Backend: ${appServerName}`);
  console.log(`- Frontend: ${webAppName}`);
}
