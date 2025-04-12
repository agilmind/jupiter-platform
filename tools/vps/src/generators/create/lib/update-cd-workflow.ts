import { Tree, logger, readNxJson } from '@nx/devkit';
import * as yaml from 'js-yaml';
import { readFileSync } from 'node:fs'; // Importar desde Node.js fs
import { join } from 'node:path'; // Importar desde Node.js path

// Asumimos que estas interfaces/funciones existen o se importan
interface VpsCreateGeneratorSchema { name: string; directory?: string; tags?: string; }
interface NormalizedOptions extends VpsCreateGeneratorSchema { projectName: string; projectRoot: string; projectDirectory: string; vpsName: string; parsedTags: string[]; }
function getDefaultBranch(tree: Tree): string { /* ... implementación ... */ try { const nxJson = tree.read('nx.json', 'utf-8'); if (nxJson) { const parsedNxJson = JSON.parse(nxJson); return parsedNxJson?.defaultBase || 'main'; } } catch (e) { logger.warn("Could not read/parse nx.json. Defaulting to 'main'."); } return 'main'; }


const WORKFLOW_PATH = '.github/workflows/cd-deploy.yml';
// Directorio relativo desde este archivo a los scripts .sh
const SCRIPTS_DIR = join(__dirname, 'scripts');

/**
 * Lee el contenido de un script de shell desde el directorio de scripts.
 */
function readWorkflowScript(scriptName: string): string {
  try {
    const scriptPath = join(SCRIPTS_DIR, scriptName);
    // Leer archivo - Asegúrate de que los archivos .sh se incluyan en la compilación del generador
    return readFileSync(scriptPath, 'utf-8');
  } catch (error: any) {
    logger.error(`❌ Failed to read workflow script: ${scriptName}`);
    logger.error(error.message);
    // Devolver un string vacío o lanzar error para detener el generador
    // Lanzar error es más seguro para evitar workflows incompletos
    throw new Error(`Could not read script file ${scriptName}`);
  }
}

/**
 * Creates or updates the .github/workflows/cd-deploy.yml file.
 * Reads step scripts from separate .sh files.
 */
export async function updateCdWorkflow(
  tree: Tree,
  normalizedOptions: NormalizedOptions
) {
  logger.info(`Checking/Updating GitHub workflow at: ${WORKFLOW_PATH}`);
  let workflow: Record<string, any> = {};

  // Leer y parsear YAML existente
  if (tree.exists(WORKFLOW_PATH)) {
    // ... (misma lógica de lectura y parseo que antes) ...
    const existingContent = tree.read(WORKFLOW_PATH, 'utf-8');
    if (existingContent) {
      try {
        const parsed = yaml.load(existingContent);
        if (typeof parsed === 'object' && parsed !== null) {
          workflow = parsed as Record<string, any>;
          logger.info(`Existing workflow found and parsed.`);
        } else {
           logger.warn(`⚠️ Existing workflow file at ${WORKFLOW_PATH} is not valid object. Overwriting.`);
           workflow = {};
        }
      } catch (e: any) {
        logger.warn( `⚠️ Existing workflow file at ${WORKFLOW_PATH} seems invalid YAML. Overwriting. Error: ${e.message}`);
        workflow = {};
      }
    }
  } else {
    logger.info(`No existing workflow found at ${WORKFLOW_PATH}. Creating new file.`);
  }

  const defaultBranch = getDefaultBranch(tree);

  // --- Definir/Actualizar Estructura del Workflow ---
  workflow.name = workflow.name ?? 'CD Deploy VPS';
  workflow.on = workflow.on ?? { push: { branches: [defaultBranch] } };
  workflow.on.push = workflow.on.push ?? { branches: [defaultBranch] };
  workflow.on.push.branches = workflow.on.push.branches ?? [defaultBranch];
  workflow.jobs = workflow.jobs ?? {};

  // --- Job: determine-affected ---
  const determineAffectedJob = workflow.jobs['determine-affected'] ?? {};
  determineAffectedJob.name = determineAffectedJob.name ?? 'Determine Affected VPS Projects';
  determineAffectedJob['runs-on'] = determineAffectedJob['runs-on'] ?? 'ubuntu-latest';
  determineAffectedJob.outputs = determineAffectedJob.outputs ?? {
    affected_matrix: '${{ steps.set-matrix.outputs.matrix }}',
    has_affected: '${{ steps.set-matrix.outputs.has_affected }}',
  };
  determineAffectedJob.steps = [ // Definimos pasos explícitamente
    { name: 'Checkout Repository (Fetch Full History)', uses: 'actions/checkout@v4', with: { 'fetch-depth': 0 } },
    { name: 'Setup Node.js', uses: 'actions/setup-node@v4', with: { 'node-version': '20', cache: 'npm' } },
    { name: 'Install Dependencies', run: 'npm ci' },
    { name: 'Install jq (for JSON processing)', run: 'sudo apt-get update && sudo apt-get install -y jq' },
    {
      name: 'Calculate Affected VPS Projects',
      id: 'set-matrix',
      // Leer script desde archivo
      run: readWorkflowScript('calculate-affected.sh'),
      env: {
        NX_BASE: '${{ env.NX_BASE }}',
        NX_HEAD: '${{ env.NX_HEAD }}',
        AFFECTED_JSON: '', // Placeholder
      },
    },
  ];
  workflow.jobs['determine-affected'] = determineAffectedJob;
  logger.info(`Job 'determine-affected' configured.`);

  // --- Job: deploy ---
  const deployJob = workflow.jobs['deploy'] ?? {};
  deployJob.name = deployJob.name ?? 'Deploy Affected VPS Configurations';
  deployJob.needs = deployJob.needs ?? 'determine-affected';
  deployJob.if = deployJob.if ?? "\${{ needs.determine-affected.outputs.has_affected == 'true' }}";
  deployJob.environment = {
    name: 'vps-production', // Usa el nombre exacto del Environment que creaste
    // Opcional: URL para mostrar en GitHub Actions
    // url: 'https://${{ secrets[format("VPS_{0}_HOST", matrix.vps_name_upper)] }}' // Ejemplo
  };
  deployJob['runs-on'] = deployJob['runs-on'] ?? 'ubuntu-latest';
  deployJob.strategy = deployJob.strategy ?? {
    'fail-fast': false,
    matrix: '${{ fromJson(needs.determine-affected.outputs.affected_matrix) }}',
  };
  deployJob.steps = [ // Definir pasos para Fase 1
      { name: 'Checkout Repository', uses: 'actions/checkout@v4' },
      { name: 'Log Deployment Target', run: 'echo "Attempting deployment for VPS: ${{ matrix.vps_name }}..."' },
      {
          name: 'Simulate Deployment Steps',
          // Leer script desde archivo
          run: readWorkflowScript('simulate-deploy.sh'),
      },
  ];
  workflow.jobs['deploy'] = deployJob;
  logger.info(`Job 'deploy' configured to target environment 'vps-production' (requires approval if set).`);

  // --- Escribir YAML ---
  try {
    const yamlContent = yaml.dump(workflow, { lineWidth: -1, noRefs: true, quotingType: '"', forceQuotes: false });
    tree.write(WORKFLOW_PATH, yamlContent);
    logger.info(`Successfully wrote updated workflow to ${WORKFLOW_PATH}`);
  } catch (e: any) {
    logger.error(`❌ Failed to dump or write YAML workflow: ${e.message}`);
    throw e; // Detener generador si falla la escritura
  }
}
