import {
  addProjectConfiguration,
  formatFiles,
  generateFiles,
  joinPathFragments,
  logger,
  names,
  readProjectConfiguration, // <-- Importar readProjectConfiguration
  Tree,
  // updateProjectConfiguration, // Podríamos necesitarlo si actualizamos config
} from '@nx/devkit';
import * as path from 'path';
import { VpsCreateGeneratorSchema } from './schema';
import { updateCdWorkflow } from './lib/update-cd-workflow';

// --- normalizeOptions (ACTUALIZADA con parsing manual de tags) ---
function normalizeOptions(tree: Tree, options: VpsCreateGeneratorSchema) {
  const name = names(options.name).fileName;
  const projectDirectory = options.directory
    ? joinPathFragments('apps', options.directory, name)
    : joinPathFragments('apps', name);
  const projectName = name; // Usar nombre limpio para project.json

  const parsedTags = options.tags
    ? options.tags.split(',').map(s => s.trim()).filter(Boolean)
    : [];
  const defaultTags = ['type:vps', `scope:${name}`];

  return {
    ...options, // Incluye forceOverwrite si se pasó
    projectName,
    projectRoot: projectDirectory,
    projectDirectory,
    vpsName: name,
    parsedTags: [...defaultTags, ...parsedTags],
  };
}

export default async function vpsCreateGenerator(
  tree: Tree,
  options: VpsCreateGeneratorSchema
): Promise<void> {
  const normalizedOptions = normalizeOptions(tree, options);
  const { projectName, projectRoot, parsedTags, vpsName, forceOverwrite } =
    normalizedOptions;

  let projectExists = false;
  try {
    // Intentar leer la configuración del proyecto
    readProjectConfiguration(tree, projectName);
    projectExists = true;
    logger.info(`Project '${projectName}' already exists at ${projectRoot}.`);
  } catch (e) {
    // El proyecto no existe, lo cual es normal si es la primera vez
    projectExists = false;
    logger.info(`Creating new project '${projectName}' at ${projectRoot}.`);
  }

  // --- Lógica Condicional ---
  if (projectExists && !forceOverwrite) {
    // Si existe y no se fuerza, lanzar error (comportamiento por defecto)
    logger.error(
      `❌ Project '${projectName}' already exists at ${projectRoot}.`
    );
    logger.warn(
      `Use the --forceOverwrite flag to overwrite existing files (use with caution).`
    );
    throw new Error(
      `Project '${projectName}' already exists. Use --forceOverwrite to overwrite.`
    );
  }

  if (projectExists && forceOverwrite) {
    // Si existe y se fuerza, mostrar advertencia pero continuar
    logger.warn(
      `--forceOverwrite specified. Overwriting files for project '${projectName}'...`
    );
    // NO llamamos a addProjectConfiguration de nuevo.
    // Podríamos llamar a updateProjectConfiguration si quisiéramos actualizar tags o targets,
    // pero por ahora lo dejamos como está para no perder cambios manuales.
  }

  // --- Acciones Comunes (Crear o Sobrescribir) ---

  // 1. Añadir/Actualizar Configuración (Solo si no existía)
  if (!projectExists) {
    addProjectConfiguration(tree, projectName, {
      root: projectRoot,
      projectType: 'application',
      sourceRoot: projectRoot,
      tags: parsedTags,
      targets: {
        lint: {
          executor: '@nx/eslint:lint',
          outputs: ['{options.outputFile}'],
          options: { lintFilePatterns: [joinPathFragments(projectRoot, 'deploy.sh')] }
        },
        deploy: {
          executor: 'nx:run-commands',
          options: { command: `echo 'INFO: Deployment for ${vpsName} is handled via CD workflow.'`},
          dependsOn: ['lint']
        },
      },
    });
  }
  // else { // Opcional: Actualizar configuración si existe y se fuerza
  //   if (forceOverwrite) {
  //      const existingConfig = readProjectConfiguration(tree, projectName);
  //      // Actualizar solo ciertas partes, por ejemplo, tags
  //      existingConfig.tags = parsedTags;
  //      updateProjectConfiguration(tree, projectName, existingConfig);
  //   }
  // }

  // 2. Generar/Sobrescribir Archivos desde Templates
  logger.info('Generating files from blueprints...');
  const templateOptions = {
    ...normalizedOptions,
    vpsName: vpsName,
    scope: vpsName,
    template: '',
  };
  generateFiles(
    tree,
    path.join(__dirname, '../../blueprints'),
    projectRoot,
    templateOptions // generateFiles sobrescribe por defecto
  );
  logger.info(`NOTE: Ensure blueprint 'deploy.sh.template' has execute permissions in Git.`);

  // 3. Actualizar Workflow de CD (Siempre se ejecuta para asegurar que esté al día)
  logger.info('Updating CD workflow file...');
  await updateCdWorkflow(tree, normalizedOptions);
  logger.info('CD workflow update complete.');

  // 4. Formatear Archivos
  await formatFiles(tree);

  // 5. Mostrar Mensajes Finales
  logger.info('-----------------------------------------------------');
  if (projectExists && forceOverwrite) {
     logger.info(`VPS configuration '${vpsName}' updated successfully.`);
  } else if (!projectExists) {
      logger.info(`VPS configuration '${vpsName}' created successfully.`);
  }
  logger.info('Next Steps:');
  logger.info(`  - Configure required GitHub Secrets (see ${projectRoot}/README.md).`);
  logger.info(`  - Review and commit generated/updated files.`);
  logger.info(`  - Ensure target VPS is initialized.`);
  logger.info('-----------------------------------------------------');
}

// Asegúrate de tener las interfaces definidas o importadas
// export interface VpsCreateGeneratorSchema { ... forceOverwrite?: boolean; }
// function normalizeOptions(...) { ... }
// import { updateCdWorkflow } from './lib/update-cd-workflow';
