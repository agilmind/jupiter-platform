import {
  Tree,
  formatFiles,
  names
} from "@nx/devkit";
import { CreateGeneratorSchema } from "./schema";
import { GeneratorOptions } from '../../blueprints/types';

import { registerNxProjects } from './nx-project-registration';
import { generateInfrastructure } from './generate-infrastructure';

export default async function (tree: Tree, options: CreateGeneratorSchema) {
  const normalizedOptions = normalizeOptions(tree, options);

  options.domainName = "jupiter.ar";
  options.sslOption = "letsencrypt";
  options.webAppInternalPort = "3000";
  options.workerPort = "3001";
  options.appServerInternalPort = "4000";
  options.appServerPort = "4000";
  options.nodeVersion = "22.13.1";
  options.letsencryptEmail = "garciafido@gmail.com";

  await generateInfrastructure(tree, options);
  registerNxProjects(tree, normalizedOptions);

  await formatFiles(tree);

  return () => {
    console.log(`✅ Proyecto "${normalizedOptions.projectName}" creado con éxito.`);
  };
}

function normalizeOptions(tree: Tree, options: CreateGeneratorSchema): GeneratorOptions {
  const projectName = names(options.projectName).fileName;
  const projectRoot = `apps/${projectName}`;

  return {
    projectName,
    projectRoot,
  };
}
