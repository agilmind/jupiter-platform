import {
  addProjectConfiguration,
  formatFiles,
  generateFiles,
  joinPathFragments,
  logger,
  names,
  readProjectConfiguration,
  Tree,
  updateProjectConfiguration, // Para actualizar si ya existe
  readJson, // Para leer nx.json si fuera necesario (aunque no lo usamos aquí)
} from '@nx/devkit';
import * as path from 'path';
import { VpsSetupInfraSchema } from './schema'; // Importar schema de infra

// Interfaz interna para opciones normalizadas
interface NormalizedInfraOptions extends VpsSetupInfraSchema {
  infraConfigRoot: string; // Ruta donde se generan los archivos ej: infra/main
  traefikDomain: string;   // Dominio completo ej: traefik.jupiter.ar
  grafanaDomain: string;   // Dominio completo ej: grafana.jupiter.ar (puede ser vacía)
}

// Función para normalizar y calcular opciones
function normalizeOptions(
  tree: Tree,
  options: VpsSetupInfraSchema
): NormalizedInfraOptions {
  const infraNameNormalized = names(options.infraName).fileName;

  // Calcular directorio de salida dentro del workspace. Default: infra/<infraName>
  const infraConfigRoot =
    options.outputDirectory || joinPathFragments('infra', infraNameNormalized);

  // Construir los FQDNs
  const traefikDomain = `${options.traefikSubdomain}.${options.baseDomain}`;
  // Devolver string vacío para grafanaDomain si monitoring está desactivado o es undefined
  const monitoringEnabled = options.monitoring ?? true; // Default a true si es undefined
  const grafanaDomain = monitoringEnabled
    ? `${options.grafanaSubdomain}.${options.baseDomain}`
    : '';

  return {
    ...options,
    infraName: infraNameNormalized, // Usar nombre normalizado
    infraConfigRoot,
    traefikDomain,
    grafanaDomain,
    monitoring: monitoringEnabled, // Asegurar valor booleano
  };
}

// --- GENERADOR PRINCIPAL vps:create (setup-infra) ---
export default async function vpsCreateGenerator(
  tree: Tree,
  options: VpsSetupInfraSchema
): Promise<void> {
  const normalizedOptions = normalizeOptions(tree, options);
  const {
    infraName,
    infraConfigRoot,
    baseDomain,
    acmeEmail,
    monitoring, // Ya tiene el valor booleano correcto
    grafanaDomain,
    traefikDomain,
  } = normalizedOptions;

  logger.info(`Generating Infrastructure Stack configuration '${infraName}'...`);
  logger.info(`  Target Directory (within workspace): ${infraConfigRoot}`);
  logger.info(`  Base Domain: ${baseDomain}`);
  logger.info(`  ACME Email: ${acmeEmail}`);
  logger.info(`  Monitoring Enabled: ${monitoring}`);
  if (monitoring && grafanaDomain) { // Solo mostrar si está habilitado Y el dominio se calculó
    logger.info(`  Grafana Access FQDN: https://${grafanaDomain}`);
  }
  logger.info(`  Traefik Dashboard FQDN: https://${traefikDomain}`);

  // 1. Registrar o Actualizar Proyecto Nx
  // Esto permite usar comandos Nx sobre la carpeta de infraestructura (lint, etc.)
  try {
    const existingProjectConfig = readProjectConfiguration(tree, infraName);
    logger.warn(
      `Nx project '${infraName}' already exists. Configuration files in '${infraConfigRoot}' will be overwritten.`
    );
    // Actualizamos tags por si cambian
    existingProjectConfig.tags = ['type:infra', `scope:${infraName}`];
    updateProjectConfiguration(tree, infraName, existingProjectConfig);
  } catch (e) {
    addProjectConfiguration(tree, infraName, {
      root: infraConfigRoot,
      projectType: 'application', // O 'library', application permite más tipos de executors
      tags: ['type:infra', `scope:${infraName}`],
      targets: {
        lint: {
          executor: '@nx/eslint:lint',
          options: {
            lintFilePatterns: [ // Patrones para linting (ajustar si se usa otro linter)
              joinPathFragments(infraConfigRoot, '**/*.yml'),
              joinPathFragments(infraConfigRoot, '**/*.yaml'),
              // Excluir .env de linting
              `!${joinPathFragments(infraConfigRoot, '.env')}`,
            ],
          },
        },
        // Target simple para mostrar los pasos manuales
        'show-deploy-steps': {
          executor: 'nx:run-commands',
          options: {
            command: `echo "Manual Deployment Steps for ${infraName}:\n1. Ensure VPS initialized.\n2. Copy files from '${infraConfigRoot}' to '/home/deploy/${infraName}/' on VPS.\n3. Create/Update '/home/deploy/${infraName}/.env' on VPS.\n4. Run 'cd /home/deploy/${infraName} && docker compose -f docker-compose-infra.yml up -d' on VPS.\n5. Configure DNS for infra domains."`
          }
        }
      },
    });
    logger.info(`Registered Nx project '${infraName}' at ${infraConfigRoot}.`);
  }

  // 2. Definir ubicación de Blueprints de Infraestructura
  const blueprintDir = 'tools/vps/src/infra-blueprints';
  if (!tree.exists(blueprintDir)) {
    throw new Error(`Infrastructure blueprints directory not found at ${blueprintDir}. Please create it and add templates.`);
  }

  // 3. Generar Archivos de Infraestructura desde Blueprints
  logger.info(`Generating files from ${blueprintDir} into ${infraConfigRoot}...`);
  const templateOptions = {
    // Pasar todas las opciones normalizadas y calculadas a EJS
    ...normalizedOptions,
    monitoringEnabled: monitoring, // Pasar flag explícito para <% if %>
    // Pasar variables con nombres simples si se prefiere en templates
    infraName: infraName,
    baseDomain: baseDomain,
    acmeEmail: acmeEmail,
    grafanaDomain: grafanaDomain,
    traefikDomain: traefikDomain,
    template: '', // Requerido por generateFiles
  };

  // generateFiles copia TODO el contenido del blueprintDir al infraConfigRoot,
  // procesando los .template y copiando los demás tal cual.
  generateFiles(
    tree,
    blueprintDir,    // Origen
    infraConfigRoot, // Destino
    templateOptions
  );

  // 4. Crear/Actualizar .gitignore dentro del directorio de infra
  const gitignorePath = joinPathFragments(infraConfigRoot, '.gitignore');
  const gitignoreContent = '# Ignore sensitive environment variables\n.env\n\n# Ignore runtime data volumes if mapped locally (though named volumes are preferred)\n# prometheus-data/\n# loki-data/\n# grafana-data/\n# promtail-positions/\n# traefik-acme/\n';
  if (!tree.exists(gitignorePath)) {
    tree.write(gitignorePath, gitignoreContent);
    logger.info(`Created ${gitignorePath} to ignore .env file.`);
  } else {
     let content = tree.read(gitignorePath, 'utf-8') || '';
     if (!content.includes('.env')) {
         content = content.trim() + '\n.env\n';
         tree.write(gitignorePath, content);
         logger.info(`Ensured '.env' is ignored in ${gitignorePath}.`);
     }
  }

  // 5. Formatear Archivos Generados/Modificados
  await formatFiles(tree);

  // 6. Mostrar Mensajes Finales
  logger.info('-----------------------------------------------------');
  logger.info(`✅ Infrastructure configuration '${infraName}' generated/updated successfully.`);
  logger.info(`   Files located in: ${infraConfigRoot}`);
  logger.info(' ');
  logger.warn('>>> IMPORTANT: Review the generated README.md for next steps! <<<');
  logger.info(`   -> ${joinPathFragments(infraConfigRoot, 'README.md')} <-`);
  logger.info(' ');
  logger.info('Summary of next steps usually involves:');
  logger.info(`  1. Commit generated files to Git.`);
  logger.info(`  2. Ensure target VPS is initialized.`);
  logger.info(`  3. Manually set up DNS records and '.env' file with secrets on the VPS.`);
  logger.info(`  4. Trigger the manual 'Deploy VPS Infrastructure Stack (Manual)' workflow on GitHub Actions.`);
  logger.info('-----------------------------------------------------');
}
