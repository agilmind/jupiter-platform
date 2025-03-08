import { Tree, logger } from '@nx/devkit';
import { ProjectGeneratorSchema, ProjectTypes } from './schema';
import { AddProjectOptions, generateProject } from '../../utils/gen-project';
import { configureApolloPrisma } from '../apollo-prisma/config';
import { configureReact } from '../react/config';
import { configureReactNative } from '../react-native/config';

async function projectGenerator(
  tree: Tree,
  options: ProjectGeneratorSchema
) {
  const configs: Record<ProjectTypes, (options: ProjectGeneratorSchema) => AddProjectOptions> = {
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

export default projectGenerator;
