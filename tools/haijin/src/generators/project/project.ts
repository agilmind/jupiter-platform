import { Tree, logger } from '@nx/devkit';
import { ProjectGeneratorSchema, ProjectTypes } from './schema';
import { AddProjectOptions, generateProject } from '../../utils/add-project';
import { configureApolloPrisma } from '../apollo-prisma/config';
import { configureReact } from '../react/config';
import { configureReactNative } from '../react-native/config';

export async function projectGenerator(
  tree: Tree,
  options: ProjectGeneratorSchema
) {
  let configs: Record<ProjectTypes, (options: ProjectGeneratorSchema) => AddProjectOptions>;
  configs = {
    'apollo-prisma': configureApolloPrisma,
    'react': configureReact,
    'react-native': configureReactNative
  };

  if (!configs[options.type]) {
    logger.error(`Unknown project type: ${options.type}`);
    return;
  }

  const config: AddProjectOptions = configs[options.type](options);

  return generateProject(tree, {
    ...config,
    update: options.update
  });
}
