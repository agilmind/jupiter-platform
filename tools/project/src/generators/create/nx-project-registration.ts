import { Tree, addProjectConfiguration } from '@nx/devkit';
import { GeneratorOptions } from '../../blueprints/types';

export function registerNxProjects(tree: Tree, options: GeneratorOptions): void {
  const { projectName } = options;

  const appServerProjectName = `${projectName}-app-server`;
  addProjectConfiguration(
    tree,
    appServerProjectName,
    {
      root: `apps/${projectName}/app-server`,
      sourceRoot: `apps/${projectName}/app-server/src`,
      projectType: 'application',
      targets: {
        build: {
          executor: '@nx/js:tsc',
          outputs: ['{options.outputPath}'],
          options: {
            outputPath: `dist/apps/${projectName}/app-server`,
            main: `apps/${projectName}/app-server/src/main.ts`,
            tsConfig: `apps/${projectName}/app-server/tsconfig.app.json`,
            assets: []
          }
        },
        serve: {
          executor: 'nx:run-commands',
          options: {
            command: `npx tsx --watch apps/${projectName}/app-server/src/main.ts`
          }
        }
      }
    }
  );

  // Registrar el proyecto web-app
  const webAppProjectName = `${projectName}-web-app`;
  addProjectConfiguration(
    tree,
    webAppProjectName,
    {
      root: `apps/${projectName}/web-app`,
      projectType: 'application',
      targets: {
        serve: {
          executor: 'nx:run-commands',
          options: {
            command: `cd apps/${projectName} && docker compose -f docker-compose.dev.yml up web-app`
          }
        }
      }
    }
  );
}
