import {
  addProjectConfiguration,
  formatFiles,
  generateFiles,
  Tree,
  names,
} from '@nx/devkit';
import * as path from 'path';
import { WorkerGeneratorSchema } from './schema';
import { createLogger } from '@jupiter/worker-framework';

const logger = createLogger('worker-generator');

function addToNginxDependsOn(dockerComposeContent, workerName) {
  // Buscar la sección completa de nginx
  const nginxRegex = / {2}nginx:[\s\S]*?depends_on:[\s\S]*?((?: {6}- .*\n)+)(?: {4}\w| {2}\w|\}|$)/m;
  const nginxMatch = dockerComposeContent.match(nginxRegex);

  if (nginxMatch) {
    // Capturamos las dependencias actuales
    const currentDependencies = nginxMatch[1];

    // Verificar si el worker ya está en las dependencias
    const workerRegex = new RegExp(`- ${workerName}\\s*\\n`);
    if (workerRegex.test(currentDependencies)) {
      return dockerComposeContent; // Ya existe, no hacemos nada
    }

    // Agregar el worker como una nueva dependencia
    const newDependencies = currentDependencies + `      - ${workerName}\n`;

    // Reemplazar las dependencias antiguas con las nuevas
    return dockerComposeContent.replace(currentDependencies, newDependencies);
  }

  return dockerComposeContent;
}

function addToDockerCompose(tree: Tree, options: WorkerGeneratorSchema, projectNames: any) {
  const dockerComposePath = 'docker-compose.yml';

  if (!tree.exists(dockerComposePath)) {
    logger.warn(`No se encontró ${dockerComposePath}. No se pudo agregar la configuración del worker.`);
    return;
  }

  // Leer el contenido como texto para preservar el formato exacto
  let dockerComposeContent = tree.read(dockerComposePath).toString();

  const workerName = options.name;
  const workerDescription = options.description;
  const kebabName = projectNames.fileName;
  const upperSnakeName = kebabName.replace(/-/g, '_').toUpperCase();

  // Preparar la entrada del nuevo servicio correctamente indentada para la sección "services"
  const newServiceEntry = `
  # ${workerDescription}
  ${workerName}:
    build:
      context: .
      dockerfile: ${options.directory}/${workerName}/Dockerfile
    container_name: app_${kebabName}
    restart: always
    environment:
      # Conexión RabbitMQ
      RABBITMQ_HOST: rabbitmq
      RABBITMQ_PORT: 5672
      RABBITMQ_USER: \${RABBITMQ_USER:-guest}
      RABBITMQ_PASSWORD: \${RABBITMQ_PASSWORD:-guest}
      ${upperSnakeName}_QUEUE: ${kebabName.replace(/-/g, '_')}
      ${upperSnakeName}_RETRY_QUEUE: ${kebabName.replace(/-/g, '_')}_retry
      ${upperSnakeName}_DEAD_LETTER_QUEUE: ${kebabName.replace(/-/g, '_')}_dlq

      # Conexión GraphQL con API principal
      GRAPHQL_ENDPOINT: http://api:4000/graphql
      GRAPHQL_API_KEY: \${INTERNAL_API_KEY:-default-api-key}
    depends_on:
      - rabbitmq
      - api
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
    networks:
      - app-network`;

  // Agregar el servicio a la sección services
  const servicesRegex = /services:\s*\n((?: {2}.*\n)*)/;
  const servicesMatch = dockerComposeContent.match(servicesRegex);

  if (servicesMatch) {
    // Obtener toda la sección de servicios
    const servicesBlock = servicesMatch[0];
    const servicesContent = servicesMatch[1];

    // Determinar dónde insertar el nuevo servicio (al final de la sección services)
    let newServicesBlock;

    if (servicesContent) {
      // Hay servicios existentes, agregar después del último
      newServicesBlock = `services:\n${servicesContent}${newServiceEntry}\n`;
    } else {
      // No hay servicios existentes, agregar como primer servicio
      newServicesBlock = `services:\n${newServiceEntry}\n`;
    }

    // Reemplazar la sección de servicios existente
    dockerComposeContent = dockerComposeContent.replace(servicesBlock, newServicesBlock);

    // Agregar también a nginx depends_on
    dockerComposeContent = addToNginxDependsOn(dockerComposeContent, workerName);

    tree.write(dockerComposePath, dockerComposeContent);
    logger.info(`Se ha añadido la configuración para ${workerName} en ${dockerComposePath}`);
  } else {
    logger.warn(`No se encontró la sección 'services:' en ${dockerComposePath}`);
  }
}

export async function workerGeneratorGenerator(
  tree: Tree,
  options: WorkerGeneratorSchema
) {
  // Normalize options con valores predeterminados
  const normalizedOptions = {
    ...options,
    directory: options.directory || 'services',
    description: options.description || `Worker for ${options.name}`
  };

  const projectName = normalizedOptions.name;
  const projectRoot = `${normalizedOptions.directory}/${projectName}`;
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
    ...normalizedOptions,
    ...projectNames,
    template: '',
    dot: '.',
    domain: normalizedOptions.domain || projectNames.fileName.replace(/-/g, '_'),
    constantName: (projectNames.fileName.replace(/-/g, '_')).toUpperCase()
  };

  generateFiles(
    tree,
    path.join(__dirname, 'files'),
    projectRoot,
    templateOptions
  );

  // Añadir al docker-compose.yml
  addToDockerCompose(tree, normalizedOptions, projectNames);

  await formatFiles(tree);
}

export default workerGeneratorGenerator;
