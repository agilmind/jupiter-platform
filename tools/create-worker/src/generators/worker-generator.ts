import {
  addProjectConfiguration,
  formatFiles,
  generateFiles,
  Tree,
  names,
} from '@nx/devkit';
import * as path from 'path';
import { WorkerGeneratorSchema } from './schema';

export async function workerGeneratorGenerator(
  tree: Tree,
  options: WorkerGeneratorSchema
) {
  // Normalize options
  const projectName = options.name;
  const projectRoot = `${options.directory}/${projectName}`;
  const projectNames = names(projectName);

  // Create project configuration
  addProjectConfiguration(tree, projectName, {
    root: projectRoot,
    projectType: 'application',
    sourceRoot: `${projectRoot}/src`,
    targets: {
      build: {
        executor: '@nx/webpack:webpack',
        outputs: ['{options.outputPath}'],
        defaultConfiguration: 'production',
        options: {
          target: 'node',
          compiler: 'tsc',
          outputPath: `dist/${projectRoot}`,
          main: `${projectRoot}/src/main.ts`,
          tsConfig: `${projectRoot}/tsconfig.app.json`,
          assets: [`${projectRoot}/src/assets`],
          isolatedConfig: true,
          webpackConfig: 'webpack.config.js',
        },
        configurations: {
          development: {},
          production: {},
        },
      },
      serve: {
        executor: '@nx/js:node',
        defaultConfiguration: 'development',
        options: {
          buildTarget: `${projectName}:build`,
        },
        configurations: {
          development: {
            buildTarget: `${projectName}:build:development`
          },
          production: {
            buildTarget: `${projectName}:build:production`
          },
        },
      },
      lint: {
        executor: '@nx/linter:eslint',
        outputs: ['{options.outputFile}'],
        options: {
          lintFilePatterns: [`${projectRoot}/**/*.ts`]
        }
      }
    },
    tags: ['type:worker', 'scope:backend'],
  });

  // Generate files
  const templateOptions = {
    ...options,
    ...projectNames,
    template: '',
    dot: '.',
  };

  generateFiles(
    tree,
    path.join(__dirname, 'files'),
    projectRoot,
    templateOptions
  );

  await formatFiles(tree);
}

export default workerGeneratorGenerator;
