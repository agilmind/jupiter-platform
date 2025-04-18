import {
  Tree,
  formatFiles,
  generateFiles,
  addProjectConfiguration,
  joinPathFragments,
  names,
  offsetFromRoot,
  logger, // Para mostrar mensajes y errores
  readJson, // Podríamos necesitar leer package.json para el scope
  updateJson, // Para añadir scripts o configuraciones
} from '@nx/devkit';
import { VpsCreateSharedServicesSchema } from './schema';
import * as path from 'path';
// import { Linter, lintProjectGenerator } from '@nx/eslint'; // Opcional: Añadir linting
// import { configurationGenerator } from '@nx/jest'; // Opcional: Añadir Jest

// Interfaz para opciones normalizadas y pasadas a las plantillas
interface NormalizedSchema extends VpsCreateSharedServicesSchema {
  projectName: string; // Nombre del proyecto lógico (normalizado)
  nxProjectName: string; // Nombre único del proyecto Nx (ej. project-shared-services)
  projectRoot: string; // Ruta raíz del proyecto generado (ej. infra/project-shared)
  projectDirectory: string; // Nombre del directorio final (ej. project-shared)
  parsedTags: string[]; // Array de tags
  // Añadir aquí otras variables necesarias para plantillas
  postgresPasswordProvided: boolean;
  rabbitPasswordProvided: boolean;
}

// Función para normalizar opciones
function normalizeOptions(
  tree: Tree,
  options: VpsCreateSharedServicesSchema
): NormalizedSchema {
  const projectNames = names(options.projectName);
  const projectNameNormalized = projectNames.fileName; // ej. 'jupiter'

  // Derivar directorio y nombre de proyecto Nx
  const projectDirectory = options.directory
    ? names(options.directory).fileName
    : `${projectNameNormalized}-shared`; // ej. 'jupiter-shared'
  const projectRoot = joinPathFragments('infra', projectDirectory); // ej. 'infra/jupiter-shared'
  const nxProjectName = projectDirectory.replace(new RegExp('/', 'g'), '-'); // ej. 'jupiter-shared' o 'other-dir-project-shared'

  const parsedTags = options.tags
    ? options.tags.split(',').map((s) => s.trim()).filter(Boolean) // Divide, limpia y filtra tags
    : []; // Array vacío si no se proporcionan tags

  // Añadir tags por defecto
  parsedTags.push(`scope:infra`, `type:shared-services`, `project:${projectNameNormalized}`);

  // Validar contraseñas requeridas
  const postgresPasswordProvided = !!options.postgresPassword;
  const rabbitPasswordProvided = !!options.rabbitPassword;

  if (options.includePostgres && !postgresPasswordProvided) {
    throw new Error(
      `La opción --postgresPassword es requerida cuando --includePostgres es true (o por defecto).`
    );
  }
  if (options.includeRabbitMQ && !rabbitPasswordProvided) {
    throw new Error(
      `La opción --rabbitPassword es requerida cuando --includeRabbitMQ es true (o por defecto).`
    );
  }

  return {
    ...options, // Incluir opciones originales
    // Sobrescribir con valores normalizados/calculados
    projectName: projectNameNormalized,
    nxProjectName: nxProjectName,
    projectRoot: projectRoot,
    projectDirectory: projectDirectory,
    parsedTags: parsedTags,
    // Asegurar valores booleanos (incluso si no se pasan, usar default del schema)
    includePostgres: options.includePostgres !== false, // Default true
    includeRabbitMQ: options.includeRabbitMQ !== false, // Default true
    postgresPasswordProvided,
    rabbitPasswordProvided,
  };
}

// Función principal del generador
export async function vpsCreateSharedServicesGenerator(
  tree: Tree,
  options: VpsCreateSharedServicesSchema
): Promise<void> { // Podría devolver un callback para tareas post-run
  const normalizedOptions = normalizeOptions(tree, options);

  // 1. Añadir configuración del proyecto a Nx
  addProjectConfiguration(tree, normalizedOptions.nxProjectName, {
    root: normalizedOptions.projectRoot,
    projectType: 'application', // O 'library', a decidir. 'application' parece razonable para un stack desplegable.
    tags: normalizedOptions.parsedTags,
    targets: {
      // Podríamos añadir un target 'deploy' que use el workflow cd-infra.yml?
      // O un target 'lint'?
    },
  });

  // 2. Generar archivos desde plantillas
  const baseBlueprintPath = path.join(__dirname, '..', '..', 'shared-blueprints');

  const templateOptions = {
    ...normalizedOptions,
    // Convertir nombres a diferentes casos si es necesario para las plantillas
    ...names(normalizedOptions.projectName), // Provee propertyName, className, constantName, fileName
    offsetFromRoot: offsetFromRoot(normalizedOptions.projectRoot),
    template: '', // Requerido por generateFiles
    dot: '.', // Para acceder a archivos como .gitignore.template
    includePostgres: normalizedOptions.includePostgres,
    includeRabbitMQ: normalizedOptions.includeRabbitMQ,
    // Pasar contraseñas (¡cuidado con loguearlas!)
    // Las plantillas .env.template NO deberían incluir las contraseñas directamente,
    // solo placeholders o referencias a ellas.
    // El docker-compose sí las necesitará referenciando al .env
    POSTGRES_PASSWORD_PLACEHOLDER: '${POSTGRES_PASSWORD}', // Placeholder para .env
    RABBITMQ_DEFAULT_PASS_PLACEHOLDER: '${RABBITMQ_DEFAULT_PASS}', // Placeholder para .env
    RABBITMQ_DEFAULT_USER: 'user', // Usuario por defecto común para RabbitMQ
  };

  // Generar archivos base (siempre presentes en shared-blueprints)
  logger.info(`Generating base files from ${baseBlueprintPath}...`);
  generateFiles(
    tree,
    baseBlueprintPath,
    normalizedOptions.projectRoot,
    templateOptions
  );

  // Generar archivos de Postgres/PgBouncer condicionalmente
  if (normalizedOptions.includePostgres) {
    logger.info(`Adding Postgres & PgBouncer specific files...`);
    const postgresBlueprintPath = path.join(baseBlueprintPath, 'postgres');
    // Verificar si el directorio existe podría ser bueno, pero generateFiles
    // usualmente no falla si la fuente no tiene archivos (a verificar).
    // Copiamos el contenido de 'postgres' al 'projectRoot'.
    // generateFiles preserva la estructura, así que creará 'pgbouncer/' dentro.
    generateFiles(
      tree,
      postgresBlueprintPath,
      normalizedOptions.projectRoot,
      templateOptions
    );
  }

  // Generar archivos de RabbitMQ condicionalmente (si existieran)
  if (normalizedOptions.includeRabbitMQ) {
    logger.info(`Adding RabbitMQ specific files (if any)...`);
    const rabbitBlueprintPath = path.join(baseBlueprintPath, 'rabbitmq');
    if (tree.exists(rabbitBlueprintPath)) { // Solo intentar si el dir existe
       generateFiles(
         tree,
         rabbitBlueprintPath,
         normalizedOptions.projectRoot,
         templateOptions
       );
    } else {
       logger.info(` - No specific blueprint files found for RabbitMQ.`);
    }
  }

  await formatFiles(tree);

  // Podríamos retornar una tarea para instalar dependencias si fueran necesarias
  // return () => { installPackagesTask(tree) };

  logger.info(`Stack de servicios compartidos '${normalizedOptions.nxProjectName}' generado en '${normalizedOptions.projectRoot}'.`);
  logger.info(`Recuerda crear el archivo '.env' en el servidor usando '${normalizedOptions.projectRoot}/.env.template' como guía y rellenar los secretos.`);
}

export default vpsCreateSharedServicesGenerator;

