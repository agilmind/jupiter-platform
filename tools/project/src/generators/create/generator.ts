import {
  Tree,
  formatFiles,
  names
} from "@nx/devkit";
import * as path from 'path';
import { CreateGeneratorSchema } from "./schema";
import { GeneratorOptions } from '../../blueprints/types';

// Importamos los generadores modulares
import { generateApolloPrisma } from './apollo-prisma-generator';
import { generateWebApp } from './web-app-generator';
import { generateDockerCompose } from './docker-compose-generator';
import { registerNxProjects } from './nx-project-registration';

export default async function (tree: Tree, options: CreateGeneratorSchema) {
  const normalizedOptions = normalizeOptions(tree, options);

  // Crear README.md principal
  tree.write(
    path.join(normalizedOptions.projectRoot, 'README.md'),
    `# ${normalizedOptions.projectName}\n\nProyecto generado automáticamente.\n`
  );

  // Generar cada componente usando los generadores modulares
  generateApolloPrisma(tree, normalizedOptions);
  generateWebApp(tree, normalizedOptions);
  generateDockerCompose(tree, normalizedOptions);

  // Registrar proyectos en NX
  registerNxProjects(tree, normalizedOptions);

  await formatFiles(tree);

  return () => {
    console.log(`✅ Proyecto "${normalizedOptions.projectName}" creado con éxito.`);
    console.log(`\nPara ejecutar el servidor backend:`);
    console.log(`   npx nx serve ${normalizedOptions.projectName}-app-server`);
    console.log(`\nPara ejecutar la aplicación web:`);
    console.log(`   npx nx serve ${normalizedOptions.projectName}-web-app`);
    console.log(`\nPara ejecutar todo el stack con Docker:`);
    console.log(`   cd apps/${normalizedOptions.projectName} && docker compose -f docker-compose.dev.yml up`);
  };
}

function normalizeOptions(tree: Tree, options: CreateGeneratorSchema) {
  const projectName = names(options.projectName).fileName;
  const projectRoot = `apps/${projectName}`;

  // Generar un timestamp único para evitar conflictos
  const timestamp = Date.now();
  const uniqueAppServerName = `${projectName}-app-server-${timestamp}`;
  const uniqueWebAppName = `${projectName}-web-app-${timestamp}`;

  return {
    ...options,
    projectName,
    projectRoot,
    uniqueAppServerName,
    uniqueWebAppName
  };
}
