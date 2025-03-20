import {
  Tree,
  formatFiles,
  names,
  readProjectConfiguration,
  removeProjectConfiguration
} from "@nx/devkit";
import * as path from 'path';
import { RemoveGeneratorSchema } from "./schema";
import { getProjects } from 'nx/src/generators/utils/project-configuration';

export default async function (tree: Tree, options: RemoveGeneratorSchema) {
  const projectName = names(options.projectName).fileName;
  const allProjects = getProjects(tree);
  const projectNames: string[] = [];
  for (const [name, configuration] of allProjects) {
    if (name.startsWith(`${projectName}-`)) {
      projectNames.push(name);
    }
  }

  // Eliminar configuraciones de proyectos
  for (const project of projectNames) {
    try {
      removeProjectConfiguration(tree, project);
      console.log(`Eliminada configuración de ${project}`);
    } catch (e) {
      console.log(`No se encontró configuración para ${project}`);
    }
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
