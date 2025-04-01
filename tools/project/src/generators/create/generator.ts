// tools/project/src/generators/create/generator.ts
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
// Importaciones para los nuevos generadores (se implementarán después)
import { generateNativeApp } from './native-app-generator';
import { generateScraperWorker } from './scraper-worker-generator';
import { generateReportWorker } from './report-worker-generator';
import { generateEmailWorker } from './email-worker-generator';
import { generateInfrastructure, setupGitHubActions } from './generate-infrastructure';

export default async function (tree: Tree, options: CreateGeneratorSchema) {
  const normalizedOptions = normalizeOptions(tree, options);

  options.appServerName = 'app-server';
  options.webAppNames = ['web-app'];
  options.nativeAppNames = ['native-app'];
  options.workerNames = ['worker-sample'];
  options.domainName = "jupiter.ar";
  options.sslOption = "letsencrypt";
  options.webAppInternalPort = "3000";
  options.appServerInternalPort = "4000";
  options.appServerPort = "4000";
  options.nodeVersion = "22.13.1";
  options.appSourcePath = path.relative(tree.root, normalizedOptions.projectRoot);

   // Llamar a la nueva función para generar la infraestructura
  await generateInfrastructure(tree, options);

  // // Configurar GitHub Actions
  // await setupGitHubActions(tree, options);

  // // Crear README.md principal
  // tree.write(
  //   path.join(normalizedOptions.projectRoot, 'README.md'),
  //   `# ${normalizedOptions.projectName}\n\nProyecto generado automáticamente.\n`
  // );
  //
  // // Generar componentes según las opciones seleccionadas
  // if (normalizedOptions.includeApolloPrisma) {
  //   generateApolloPrisma(tree, normalizedOptions);
  // }
  //
  // if (normalizedOptions.includeWebApp) {
  //   generateWebApp(tree, normalizedOptions);
  // }
  //
  // if (normalizedOptions.includeNativeApp) {
  //   generateNativeApp(tree, normalizedOptions);
  // }
  //
  // // Habilitar RabbitMQ automáticamente si hay algún worker
  // if (normalizedOptions.includeScraperWorker ||
  //     normalizedOptions.includeReportWorker ||
  //     normalizedOptions.includeEmailWorker) {
  //   normalizedOptions.includeRabbitMQ = true;
  // }
  //
  // if (normalizedOptions.includeScraperWorker) {
  //   generateScraperWorker(tree, normalizedOptions);
  // }
  //
  // if (normalizedOptions.includeReportWorker) {
  //   generateReportWorker(tree, normalizedOptions);
  // }
  //
  // if (normalizedOptions.includeEmailWorker) {
  //   generateEmailWorker(tree, normalizedOptions);
  // }
  //
  // // Generar docker-compose con todos los servicios seleccionados
  // generateDockerCompose(tree, normalizedOptions);
  //
  // Registrar proyectos en NX
  registerNxProjects(tree, normalizedOptions);

  await formatFiles(tree);

  return () => {
    console.log(`✅ Proyecto "${normalizedOptions.projectName}" creado con éxito.`);

    // Mostrar instrucciones específicas para los servicios generados
    if (normalizedOptions.includeApolloPrisma) {
      console.log(`\nPara ejecutar el servidor backend:`);
      console.log(`   npx nx serve ${normalizedOptions.projectName}-app-server`);
    }

    if (normalizedOptions.includeWebApp) {
      console.log(`\nPara ejecutar la aplicación web:`);
      console.log(`   npx nx serve ${normalizedOptions.projectName}-web-app`);
    }

    if (normalizedOptions.includeNativeApp) {
      console.log(`\nPara ejecutar la aplicación móvil:`);
      console.log(`   npx nx serve ${normalizedOptions.projectName}-native-app`);
    }

    console.log(`\nPara ejecutar todo el stack con Docker:`);
    console.log(`   cd apps/${normalizedOptions.projectName} && docker compose -f docker-compose.dev.yml up`);
  };
}

function normalizeOptions(tree: Tree, options: CreateGeneratorSchema): GeneratorOptions {
  const projectName = names(options.projectName).fileName;
  const projectRoot = `apps/${projectName}`;

  return {
    projectName,
    projectRoot,
    includeApolloPrisma: options.includeApolloPrisma ?? true,
    includeWebApp: options.includeWebApp ?? true,
    includeNativeApp: options.includeNativeApp ?? false,
    includeScraperWorker: options.includeScraperWorker ?? false,
    includeReportWorker: options.includeReportWorker ?? false,
    includeEmailWorker: options.includeEmailWorker ?? false,
    includePgBouncer: options.includePgBouncer ?? false,
    includeRabbitMQ: options.includeRabbitMQ ?? false
  };
}
