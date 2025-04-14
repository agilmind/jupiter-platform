import {
  addProjectConfiguration,
  formatFiles,
  generateFiles,
  joinPathFragments,
  logger,
  names,
  readProjectConfiguration,
  Tree,
  updateProjectConfiguration, // Importar por si actualizamos config
} from '@nx/devkit';
import * as path from 'path';
import { VpsCreateGeneratorSchema } from './schema';
import { NormalizedOptions } from './lib/types'
import { updateCdWorkflow } from './lib/update-cd-workflow';
import { getDefaultBranch } from './utils';

function normalizeOptions(tree: Tree, options: VpsCreateGeneratorSchema): NormalizedOptions { // <-- Usar tipo importado
  const name = names(options.name).fileName;
  const projectDirectory = options.directory
    ? joinPathFragments('apps', options.directory, name)
    : joinPathFragments('apps', name);
  const projectName = name;

  if (!options.domains || options.domains.trim().length === 0) { /*...*/ }
  const domainsList = options.domains.split(',').map(d => d.trim()).filter(Boolean);
  if (domainsList.length === 0) { /*...*/ }
  const primaryDomain = domainsList[0];
  const parsedTags = options.tags ? options.tags.split(',').map(s => s.trim()).filter(Boolean) : [];
  const defaultTags = ['type:vps', `scope:${name}`];
  const vpsNameUpper = name.toUpperCase().replace(/-/g, '_');

  return {
    ...options,
    projectName,
    projectRoot: projectDirectory,
    projectDirectory,
    vpsName: name,
    parsedTags: [...defaultTags, ...parsedTags],
    domainsList: domainsList,
    primaryDomain: primaryDomain,
    vpsNameUpper: vpsNameUpper, // <-- Añadir al objeto devuelto
  };
}

export default async function vpsCreateGenerator(
  tree: Tree,
  options: VpsCreateGeneratorSchema
): Promise<void> {
  const normalizedOptions = normalizeOptions(tree, options);
  const {
    projectName,
    projectRoot,
    parsedTags,
    vpsName,
    forceOverwrite,
    domainsList,
    primaryDomain,
    monitoring
   } = normalizedOptions;

  const defaultBranch = getDefaultBranch(tree);
  logger.info(`Default branch detected/set to: ${defaultBranch}`);

  let projectExists = false;
  try {
    readProjectConfiguration(tree, projectName);
    projectExists = true;
    logger.info(`Project '${projectName}' already exists at ${projectRoot}. Checking --forceOverwrite...`);
  } catch (e) {
    projectExists = false;
    logger.info(`Creating new project '${projectName}' at ${projectRoot}.`);
  }

  if (projectExists && !forceOverwrite) {
    logger.error(`❌ Project '${projectName}' already exists. Use --forceOverwrite.`);
    throw new Error(`Project '${projectName}' already exists.`);
  }
  if (projectExists && forceOverwrite) {
    logger.warn(`--forceOverwrite specified. Overwriting files for project '${projectName}'...`);
  }

  // --- Acciones Comunes ---

  // 1. Añadir/Actualizar Configuración
  if (!projectExists) {
    addProjectConfiguration(tree, projectName, {
      root: projectRoot, projectType: 'application', sourceRoot: projectRoot, tags: parsedTags,
      targets: {
        lint: {
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
  } else if (forceOverwrite) {
     // Opcional: Actualizar solo tags si se fuerza sobrescritura
     try {
        const existingConfig = readProjectConfiguration(tree, projectName);
        existingConfig.tags = parsedTags; // Actualizar tags
        updateProjectConfiguration(tree, projectName, existingConfig);
        logger.info(`Updated tags for existing project '${projectName}'.`);
     } catch(e) {
        logger.warn(`Could not update project configuration for ${projectName}. It might need manual review.`);
     }
  }

  // 2. Generar/Sobrescribir Archivos desde Templates
  logger.info('Generating files from Phase 3 blueprints (incl. SSL)...');
  const templateOptions = {
    ...normalizedOptions,
    monitoringEnabled: monitoring,
    domains: domainsList.join(' '),
    primaryDomain: primaryDomain,
    template: '',
  };

  generateFiles(
    tree,
    path.join(__dirname, '../../blueprints'), // Ruta a los templates
    projectRoot, // Destino
    templateOptions
  );
  logger.info(`NOTE: Ensure 'deploy.sh.template' has execute permissions in Git.`);
  logger.info(`NOTE: Ensure 'ssl-dhparams.pem' exists in blueprints/nginx-conf/ (generate once with openssl).`);


  // 3. Generar Archivos de Monitoreo (Condicional)
  if (monitoring) {
    logger.info('Monitoring enabled. Generating monitoring configuration files...');
    // Definir ruta donde guardar configs de monitoreo (ej: dentro del proyecto)
    const monitoringConfigPath = joinPathFragments(projectRoot, 'monitoring-conf');
    generateFiles(
      tree,
      path.join(__dirname, '../../monitoring-blueprints'),
      monitoringConfigPath, // <- Destino para configs de monitoring
      templateOptions // Reusamos las mismas opciones
    );
  }

  // 4. Actualizar Workflow de CD
  logger.info('Updating CD workflow file...');
  await updateCdWorkflow(tree, normalizedOptions);
  logger.info('CD workflow update complete.');

  // 5. Formatear Archivos
  await formatFiles(tree);

  // 6. Mostrar Mensajes Finales
  logger.info('-----------------------------------------------------');
  if (projectExists && forceOverwrite) { logger.info(`VPS configuration '${vpsName}' updated successfully.`); }
  else if (!projectExists) { logger.info(`VPS configuration '${vpsName}' created successfully.`); }
  if (normalizedOptions.monitoring) { logger.info(`   Monitoring stack (Prometheus, Grafana, Loki) included.`); }
  logger.info(`   Project Root: ${projectRoot}`);
  logger.info(' ');
  logger.warn('>>> ACCIONES MANUALES REQUERIDAS EN EL SERVIDOR VPS <<<');
  logger.info('   (Ver detalles completos en el README generado)');
  logger.warn('  1. Obtener Certificado SSL Inicial:');
  logger.info(`     - Conéctate al VPS como admin y ejecuta 'sudo certbot certonly --dns-[provider]'`);
  logger.info(`     - Incluye TODOS los dominios: ${domainsList.join(', ')}`);
  logger.info(`     - ¡Haz esto ANTES del primer despliegue del workflow!`);
  logger.warn('  2. Configurar Certbot Deploy Hook:');
  logger.info(`     - Después de obtener el certificado, edita (con sudo) el archivo:`);
  logger.info(`       /etc/letsencrypt/renewal/${primaryDomain}.conf`);
  logger.info(`     - Añade/Verifica la línea 'deploy_hook' para reiniciar Nginx:`);
  logger.info(`       deploy_hook = docker compose -f /home/deploy/apps/${vpsName}/docker-compose.vps.yml restart nginx`);
  logger.warn('  3. Configurar GitHub Secrets:');
  logger.info(`     - Asegúrate de que los secrets para HOST, USER y KEY de '${vpsName.toUpperCase().replace(/-/g, '_')}' estén creados en GitHub.`);
  logger.info(' ');
  logger.info('>>> PRÓXIMOS PASOS: <<<');
  logger.info(`  1. Realiza las acciones manuales en el VPS si es la primera vez.`);
  logger.info(`  2. Revisa y haz commit de los archivos generados/actualizados.`);
  logger.info(`  3. Haz push a la rama '${defaultBranch}' para iniciar el despliegue vía GitHub Actions.`);
  logger.info('-----------------------------------------------------');
}
