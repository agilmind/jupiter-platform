import { Tree, logger } from '@nx/devkit';
import { ProjectGeneratorSchema, ProjectTypes } from './schema';
import { AddProjectOptions, generateProject } from '../../utils/add-project';
import { configureApolloPrisma } from '../add-apollo-prisma/config';
import { configureReact } from '../add-react/config';
import { configureReactNative } from '../add-react-native/config';

export async function projectGenerator(
  tree: Tree,
  options: ProjectGeneratorSchema
) {
  // Seleccionar configuración según el tipo
  let configs: Record<ProjectTypes, (options: ProjectGeneratorSchema) => AddProjectOptions>;
  configs = {
    'apollo-prisma': configureApolloPrisma,
    'react': configureReact,
    'react-native': configureReactNative
  };

  // Usar la configuración específica para este tipo
  if (!configs[options.type]) {
    logger.error(`Unknown project type: ${options.type}`);
    return;
  }

  // Obtener configuración específica
  const config: AddProjectOptions = configs[options.type](options);

  // Generar proyecto
  return generateProject(tree, {
    ...config,
    update: options.update
  });
}

export default projectGenerator;
