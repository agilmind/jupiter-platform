import {
  Tree,
  formatFiles,
  names,
  readProjectConfiguration,
  removeProjectConfiguration
} from "@nx/devkit";
import * as path from 'path';
import { RemoveGeneratorSchema } from "./schema";

export default async function (tree: Tree, options: RemoveGeneratorSchema) {
  const projectName = names(options.projectName).fileName;
  const appServerProjectName = `${projectName}-app-server`;
  const webAppProjectName = `${projectName}-web-app`;

  // Eliminar configuraciones de proyectos
  try {
    removeProjectConfiguration(tree, appServerProjectName);
    console.log(`Eliminada configuración de ${appServerProjectName}`);
  } catch (e) {
    console.log(`No se encontró configuración para ${appServerProjectName}`);
  }

  try {
    removeProjectConfiguration(tree, webAppProjectName);
    console.log(`Eliminada configuración de ${webAppProjectName}`);
  } catch (e) {
    console.log(`No se encontró configuración para ${webAppProjectName}`);
  }

  // Eliminar directorios físicos
  const projectRoot = `apps/${projectName}`;
  if (tree.exists(projectRoot)) {
    tree.delete(projectRoot);
    console.log(`Eliminado directorio ${projectRoot}`);
  } else {
    console.log(`No se encontró directorio ${projectRoot}`);
  }

  await formatFiles(tree);

  return () => {
    console.log(`✅ Proyecto "${projectName}" eliminado correctamente`);
  };
}
