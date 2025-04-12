import {
  addProjectConfiguration,
  formatFiles,
  generateFiles,
  joinPathFragments,
  logger,
  names,
  readProjectConfiguration,
  Tree,
} from '@nx/devkit';
import * as path from 'path';
import { updateCdWorkflow } from './lib/update-cd-workflow';
import { VpsCreateGeneratorSchema } from './schema';

function normalizeOptions(tree: Tree, options: VpsCreateGeneratorSchema) {
  const name = names(options.name).fileName;
  const projectDirectory = options.directory
    ? joinPathFragments('apps', options.directory, name)
    : joinPathFragments('apps', name);
  const projectName = name;
  const parsedTags = options.tags
    ? options.tags.split(',').map(s => s.trim()).filter(Boolean)
    : [];
  const defaultTags = ['type:vps', `scope:${name}`];
  return { ...options, projectName, projectRoot: projectDirectory, projectDirectory, vpsName: name, parsedTags: [...defaultTags, ...parsedTags] };
}

// --- GENERADOR PRINCIPAL (ACTUALIZADO LINT TARGET) ---
export default async function vpsCreateGenerator(
  tree: Tree,
  options: VpsCreateGeneratorSchema
): Promise<void> {
  const normalizedOptions = normalizeOptions(tree, options);
  const { projectName, projectRoot, parsedTags, vpsName, forceOverwrite } = normalizedOptions;

  let projectExists = false;
  try {
    readProjectConfiguration(tree, projectName); projectExists = true; logger.info(`Project '${projectName}' exists. Checking --forceOverwrite...`);
  } catch (e) { projectExists = false; logger.info(`Creating new project '${projectName}' at ${projectRoot}.`); }

  if (projectExists && !forceOverwrite) {
    logger.error(`❌ Project '${projectName}' already exists. Use --forceOverwrite.`); throw new Error(`Project '${projectName}' already exists.`);
  }
  if (projectExists && forceOverwrite) { logger.warn(`--forceOverwrite specified. Overwriting files for project '${projectName}'...`); }

  // --- Acciones Comunes ---

  // 1. Añadir/Actualizar Configuración (Solo si no existía)
  if (!projectExists) {
    addProjectConfiguration(tree, projectName, {
      root: projectRoot, projectType: 'application', sourceRoot: projectRoot, tags: parsedTags,
      targets: {
        lint: { // Actualizar para incluir más archivos si se desea
          executor: '@nx/eslint:lint', outputs: ['{options.outputFile}'],
          options: {
            lintFilePatterns: [
              joinPathFragments(projectRoot, 'deploy.sh'),
              joinPathFragments(projectRoot, 'docker-compose.vps.yml'),
              joinPathFragments(projectRoot, 'nginx-conf/**/*.conf'), // Lint configs Nginx
            ]
          }
        },
        deploy: {
          executor: 'nx:run-commands', options: { command: `echo 'INFO: Deployment for ${vpsName} is via CD workflow.'` }, dependsOn: ['lint']
        },
      },
    });
  }
  // (Opcional: Lógica para actualizar project.json si existe y forceOverwrite=true)

  // 2. Generar/Sobrescribir Archivos desde Templates
  logger.info('Generating files from blueprints...');
  const templateOptions = { ...normalizedOptions, vpsName: vpsName, scope: vpsName, template: '' };
  generateFiles(
    tree,
    // Asegúrate que esta ruta sea correcta relativa a este archivo generator.ts
    // Probablemente necesite '../' si blueprints está en src/ y generator en src/generators/create
    path.join(__dirname, '../../blueprints'),
    projectRoot, // Destino
    templateOptions
  );
  logger.info(`NOTE: Ensure 'deploy.sh.template' has execute permissions in Git.`);

  // 3. Actualizar Workflow de CD
  logger.info('Updating CD workflow file...');
  // Pasamos las opciones normalizadas, incluyendo vpsName_upper si la función lo necesita
  await updateCdWorkflow(tree, { ...normalizedOptions, vpsNameUpper: vpsName.toUpperCase().replace(/-/g, '_') });
  logger.info('CD workflow update complete.');

  // 4. Formatear Archivos
  await formatFiles(tree);

  // 5. Mostrar Mensajes Finales
  // ... (Mensajes finales como antes) ...
  logger.info('-----------------------------------------------------');
  if (projectExists && forceOverwrite) { logger.info(`VPS configuration '${vpsName}' updated successfully.`); }
  else if (!projectExists) { logger.info(`VPS configuration '${vpsName}' created successfully.`); }
  logger.info(`Review files in '${projectRoot}' and commit changes.`);
  logger.info('-----------------------------------------------------');
}

// --- Interfaces y Helpers (Asegúrate que estén definidas o importadas) ---
// import { updateCdWorkflow } from './lib/update-cd-workflow'; // O define localmente
// async function updateCdWorkflow(tree: Tree, options: NormalizedOptions & { vpsNameUpper: string }) { /* ... */ }
