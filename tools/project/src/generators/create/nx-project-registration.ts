import { Tree, updateJson } from '@nx/devkit';
import * as path from 'path';
import { GeneratorOptions } from '../../blueprints/types';

export function registerNxProjects(tree: Tree, options: GeneratorOptions): void {
  const { projectName, projectRoot } = options;

  // 1. Definir nombres de proyectos
  const projectNames = {};
  const stackProjectName = `${projectName}-stack`;

  if (options.includeApolloPrisma) {
    projectNames['appServer'] = `${projectName}-app-server`;
  }

  if (options.includeWebApp) {
    projectNames['webApp'] = `${projectName}-web-app`;
  }

  if (options.includeNativeApp) {
    projectNames['nativeApp'] = `${projectName}-native-app`;
  }

  if (options.includeScraperWorker) {
    projectNames['scraperWorker'] = `${projectName}-scraper-worker`;
  }

  if (options.includeReportWorker) {
    projectNames['reportWorker'] = `${projectName}-report-worker`;
  }

  if (options.includeEmailWorker) {
    projectNames['emailWorker'] = `${projectName}-email-worker`;
  }

  // 2. Actualizar nx.json
  if (tree.exists('nx.json')) {
    updateJson(tree, 'nx.json', (json) => {
      if (!json.projects) {
        json.projects = {};
      }

      // Registrar proyectos según lo que se ha incluido
      if (options.includeApolloPrisma) {
        json.projects[projectNames['appServer']] = {
          tags: [],
          root: `apps/${projectName}/app-server`
        };
      }

      if (options.includeWebApp) {
        json.projects[projectNames['webApp']] = {
          tags: [],
          root: `apps/${projectName}/web-app`
        };
      }

      if (options.includeNativeApp) {
        json.projects[projectNames['nativeApp']] = {
          tags: [],
          root: `apps/${projectName}/native-app`
        };
      }

      if (options.includeScraperWorker) {
        json.projects[projectNames['scraperWorker']] = {
          tags: [],
          root: `apps/${projectName}/scraper-worker`
        };
      }

      if (options.includeReportWorker) {
        json.projects[projectNames['reportWorker']] = {
          tags: [],
          root: `apps/${projectName}/report-worker`
        };
      }

      if (options.includeEmailWorker) {
        json.projects[projectNames['emailWorker']] = {
          tags: [],
          root: `apps/${projectName}/email-worker`
        };
      }

      return json;
    });
  }

  // 3. Crear archivos project.json según los componentes incluidos
  if (options.includeApolloPrisma) {
    const appServerProjectJson = {
      name: projectNames['appServer'],
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

    tree.write(
      path.join(projectRoot, 'app-server', 'project.json'),
      JSON.stringify(appServerProjectJson, null, 2)
    );
  }

  // Configuraciones para otros componentes (similarmente condicionales)
  if (options.includeWebApp) {
    const webAppProjectJson = {
      name: projectNames['webApp'],
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

    tree.write(
      path.join(projectRoot, 'web-app', 'project.json'),
      JSON.stringify(webAppProjectJson, null, 2)
    );
  }

  // 4. Crear project.json para el stack
  const stackProjectJson = {
    name: stackProjectName,
    projectType: "application",
    root: `apps/${projectName}`,
    targets: {
      serve: {
        executor: "nx:run-commands",
        options: {
          command: `cd apps/${projectName} && docker compose -f docker-compose.dev.yml up`
        }
      },
      "serve-api-only": {
        executor: "nx:run-commands",
        options: {
          command: `DATABASE_URL=postgresql://postgres:postgres@localhost:5433/${projectName} npx tsx --watch apps/${projectName}/app-server/src/main.ts`
        }
      },
      "serve-db-only": {
        executor: "nx:run-commands",
        options: {
          command: `cd apps/${projectName} && docker compose -f docker-compose.dev.yml up postgres`
        }
      },
      "serve-ui-only": {
        executor: "nx:run-commands",
        options: {
          command: `cd apps/${projectName} && docker compose -f docker-compose.dev.yml up web-app`
        }
      },
      "debug": {
        executor: "nx:run-commands",
        options: {
          parallel: true,
          commands: [
            `cd apps/${projectName} && docker compose -f docker-compose.dev.yml up postgres web-app`,
            `sleep 5 && DATABASE_URL=postgresql://postgres:postgres@localhost:5433/${projectName} npx tsx --watch apps/${projectName}/app-server/src/main.ts`
          ]
        }
      }
    }
  };

  tree.write(
    path.join(projectRoot, 'project.json'),
    JSON.stringify(stackProjectJson, null, 2)
  );

  // Información sobre los proyectos registrados
  console.log(`Proyectos registrados:`);
  Object.entries(projectNames).forEach(([key, value]) => {
    console.log(`- ${key}: ${value}`);
  });
}
