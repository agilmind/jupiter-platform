import {
  Tree,
  formatFiles,
  readProjectConfiguration,
  removeProjectConfiguration,
  names,
  logger, // Para mostrar mensajes
} from '@nx/devkit';
import { AppRemoveGeneratorSchema } from './schema';

export async function appRemoveGenerator(
  tree: Tree,
  options: AppRemoveGeneratorSchema
): Promise<void> {
  // 1. Calcular el nombre del proyecto Nx (igual que en 'create')
  const projectNameNormalized = names(options.projectName).fileName;
  const appNameNormalized = names(options.appName).fileName;
  const nxProjectName = `${projectNameNormalized}-${appNameNormalized}`; // e.g., 'jupiter-www'

  logger.info(`Attempting to remove project '${nxProjectName}'...`);

  // 2. Leer la configuración del proyecto para obtener su raíz y verificar que existe
  let projectConfig;
  try {
    projectConfig = readProjectConfiguration(tree, nxProjectName);
  } catch (e) {
    logger.error(`Project '${nxProjectName}' not found in workspace. Cannot remove.`);
    throw new Error(`Project '${nxProjectName}' not found.`);
  }

  // 3. Eliminar la configuración del proyecto de Nx
  // La opción 'force' aquí aplica a la confirmación que podría pedir Nx,
  // pero removeProjectConfiguration actualmente no la usa directamente.
  // La opción es más relevante si delegáramos a @nx/workspace:remove
  const removed = removeProjectConfiguration(tree, nxProjectName);

  if (!removed) {
     logger.warn(`Configuration for project '${nxProjectName}' could not be removed.`);
     // Decide si quieres lanzar un error aquí o solo advertir
     // throw new Error(`Failed to remove project configuration for '${nxProjectName}'.`);
  } else {
     logger.log(` ✓ Removed project configuration '${nxProjectName}'`);
  }


  // 4. Eliminar el directorio del proyecto del sistema de archivos virtual
  if (projectConfig.root && tree.exists(projectConfig.root)) {
    tree.delete(projectConfig.root);
    logger.log(` ✓ Deleted directory '${projectConfig.root}'`);
  } else {
    logger.warn(`Directory for project '${nxProjectName}' at '${projectConfig.root}' not found or already deleted.`);
  }

  // 5. Formatear archivos (si no se omite)
  if (!options.skipFormat) {
    await formatFiles(tree);
  }

  logger.info(`Project '${nxProjectName}' removal process finished.`);
}

export default appRemoveGenerator;
