import { Tree, logger, readNxJson } from '@nx/devkit';
import * as yaml from 'js-yaml';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Interfaces y helpers (getDefaultBranch, readWorkflowScript) como estaban antes...
interface VpsCreateGeneratorSchema { name: string; directory?: string; tags?: string; forceOverwrite?: boolean; }
interface NormalizedOptions extends VpsCreateGeneratorSchema { projectName: string; projectRoot: string; projectDirectory: string; vpsName: string; parsedTags: string[]; vpsNameUpper: string; }
function getDefaultBranch(tree: Tree): string { /* ... */ try { const p = JSON.parse(tree.read('nx.json', 'utf-8') || '{}'); return p?.defaultBase || 'main'; } catch { return 'main';}}
const SCRIPTS_DIR = join(__dirname, 'scripts');
function readWorkflowScript(scriptName: string): string { /* ... */ try { return readFileSync(join(SCRIPTS_DIR, scriptName), 'utf-8'); } catch (e:any) { logger.error(`Read ${scriptName} failed: ${e.message}`); throw e; }}


const WORKFLOW_PATH = '.github/workflows/cd-deploy.yml';

export async function updateCdWorkflow(
  tree: Tree,
  normalizedOptions: NormalizedOptions
) {
  logger.info(`Checking/Updating GitHub workflow at: ${WORKFLOW_PATH}`);
  let workflow: Record<string, any> = {};

  // Leer y parsear YAML existente... (igual que antes)
  if (tree.exists(WORKFLOW_PATH)) { /* ... parse logic ... */ } else { /* ... */ }

  const defaultBranch = getDefaultBranch(tree);

  // --- Definir/Actualizar Estructura del Workflow ---
  workflow.name = workflow.name ?? 'CD Deploy VPS';
  workflow.on = workflow.on ?? { push: { branches: [defaultBranch] } };
  workflow.on.push = workflow.on.push ?? { branches: [defaultBranch] };
  workflow.on.push.branches = workflow.on.push.branches ?? [defaultBranch];
  workflow.jobs = workflow.jobs ?? {};

  // --- Job: determine-affected ---
  const determineAffectedJob = workflow.jobs['determine-affected'] ?? {};
  // ... (Configuración del job 'determine-affected' como en la versión anterior, incluyendo el step para instalar jq y el step 'Calculate Affected VPS Projects' que lee calculate-affected.sh) ...
  determineAffectedJob.name = 'Determine Affected VPS Projects';
  determineAffectedJob['runs-on'] = 'ubuntu-latest';
  determineAffectedJob.outputs = { affected_matrix: '${{ steps.set-matrix.outputs.matrix }}', has_affected: '${{ steps.set-matrix.outputs.has_affected }}' };
  determineAffectedJob.steps = [
    { name: 'Checkout Repository (Fetch Full History)', uses: 'actions/checkout@v4', with: { 'fetch-depth': 0 } },
    { name: 'Setup Node.js', uses: 'actions/setup-node@v4', with: { 'node-version': '20', cache: 'npm' } },
    { name: 'Install Dependencies', run: 'npm ci' },
    { name: 'Install jq (for JSON processing)', run: 'sudo apt-get update && sudo apt-get install -y jq' },
    {
      name: 'Calculate Affected VPS Projects', id: 'set-matrix',
      run: readWorkflowScript('calculate-affected.sh'), // Lee del archivo .sh
      env: { NX_BASE: '${{ env.NX_BASE }}', NX_HEAD: '${{ env.NX_HEAD }}', AFFECTED_JSON: '' }
    },
  ];
  workflow.jobs['determine-affected'] = determineAffectedJob;


  // --- Job: deploy (ACTUALIZADO CON ENV Y RUN CORREGIDOS) ---
  const deployJob = workflow.jobs['deploy'] ?? {};
  deployJob.name = deployJob.name ?? 'Deploy Affected VPS Configurations';
  deployJob.needs = deployJob.needs ?? 'determine-affected';
  deployJob.if = deployJob.if ?? "\${{ needs.determine-affected.outputs.has_affected == 'true' }}";
  deployJob.environment = {
    name: 'vps-production', // Nombre del Environment en GitHub
    // Usar la variable de entorno para construir la URL, NO format() dentro de secrets[]
    url: 'http://${{ secrets[env.SECRET_NAME_HOST] }}' // Acceder usando el env var definido abajo
  };
  deployJob['runs-on'] = deployJob['runs-on'] ?? 'ubuntu-latest';
  deployJob.strategy = deployJob.strategy ?? {
    'fail-fast': false,
    matrix: '${{ fromJson(needs.determine-affected.outputs.affected_matrix) }}',
  };

  deployJob.env = {
      SECRET_NAME_HOST: 'VPS_${{ matrix.vps_name_upper }}_HOST',
      SECRET_NAME_USER: 'VPS_${{ matrix.vps_name_upper }}_USER',
      SECRET_NAME_KEY:  'VPS_${{ matrix.vps_name_upper }}_KEY',
  };

  // --- PASOS DE DESPLIEGUE REALES CON CORRECCIONES ---
  deployJob.steps = [
      {
         name: 'Checkout Repository',
         uses: 'actions/checkout@v4'
      },
      {
         name: 'Log Deployment Target',
         // Usar env var para acceder al nombre del secret
         run: 'echo "Deploying project ${{ matrix.vps_name }} to host ${{ secrets[env.SECRET_NAME_HOST] }}..."'
      },
      {
         name: 'Setup SSH Agent',
         uses: 'webfactory/ssh-agent@v0.9.0',
         with: {
           // Usar env var para acceder al nombre del secret
           'ssh-private-key': "\${{ secrets[env.SECRET_NAME_KEY] }}",
         },
      },
      {
         name: 'Add VPS Host to Known Hosts',
         // Script multilínea usando |
         run: `|
          # Usar env var para acceder al nombre del secret
          VPS_HOST="\${{ secrets[env.SECRET_NAME_HOST] }}"
          if [ -z "$VPS_HOST" ]; then
            echo "Error: VPS host secret (via env.SECRET_NAME_HOST) is not set."
            exit 1
          fi
          mkdir -p ~/.ssh
          ssh-keyscan -H "$VPS_HOST" >> ~/.ssh/known_hosts
          echo "Added $VPS_HOST to known_hosts"
         `,
      },
      {
         name: 'Sync Files via Rsync',
         // Script multilínea usando |
         run: `|
          # Usar env vars para nombres de secrets
          VPS_HOST="\${{ secrets[env.SECRET_NAME_HOST] }}"
          # Obtener valor del secret USER
          SECRET_USER_VALUE="\${{ secrets[env.SECRET_NAME_USER] }}"
          # Aplicar default en Bash correctamente
          VPS_USER="\${SECRET_USER_VALUE:-deploy}"

          PROJECT_NAME="\${{ matrix.vps_name }}"
          # Usar $VPS_USER en la ruta de destino
          TARGET_DIR="/home/\${VPS_USER}/apps/\${PROJECT_NAME}"

          echo "Syncing ./apps/\${PROJECT_NAME}/ to \${VPS_USER}@\${VPS_HOST}:\${TARGET_DIR}/"
          rsync -avz --delete \
            ./apps/\${PROJECT_NAME}/ \
            "\${VPS_USER}@\${VPS_HOST}:\${TARGET_DIR}/" \
            || { echo "Rsync failed!"; exit 1; }
         `,
      },
      {
         name: 'Execute Remote Deployment Script',
         // Script multilínea usando |
         run: `|
          # Obtener valores y aplicar defaults como en el paso anterior
          VPS_HOST="\${{ secrets[env.SECRET_NAME_HOST] }}"
          SECRET_USER_VALUE="\${{ secrets[env.SECRET_NAME_USER] }}"
          VPS_USER="\${SECRET_USER_VALUE:-deploy}"
          PROJECT_NAME="\${{ matrix.vps_name }}"
          # Usar $VPS_USER en la ruta
          REMOTE_APP_DIR="/home/\${VPS_USER}/apps/\${PROJECT_NAME}"
          REMOTE_SCRIPT_PATH="\${REMOTE_APP_DIR}/deploy.sh" # Definir aquí por claridad

          echo "Executing \${REMOTE_SCRIPT_PATH} on \${VPS_USER}@\${VPS_HOST}..."
          # Usar comillas dobles en el Here Document para permitir expansión de variables locales
          ssh "\${VPS_USER}@\${VPS_HOST}" << EOF
            echo "[Remote] Executing deploy script for \${PROJECT_NAME}..." # Aquí \${PROJECT_NAME} se expande localmente ANTES de enviar a ssh
            cd "\${REMOTE_APP_DIR}" || exit 1 # Aquí \${REMOTE_APP_DIR} se expande localmente
            bash deploy.sh # El nombre del script es fijo
            echo "[Remote] deploy.sh finished."
          EOF
          if [ $? -ne 0 ]; then echo "Remote script execution failed!"; exit 1; fi
         `,
      },
  ];
  // --- FIN PASOS REALES ---

  workflow.jobs['deploy'] = deployJob;
  logger.info(`Job 'deploy' configured with corrected real deployment steps.`);

  // --- Escribir YAML (igual que antes) ---
  try {
    const yamlContent = yaml.dump(workflow, { lineWidth: -1, noRefs: true, quotingType: '"', forceQuotes: false });
    tree.write(WORKFLOW_PATH, yamlContent);
    logger.info(`Successfully wrote updated workflow to ${WORKFLOW_PATH}`);
  } catch (e: any) { logger.error(`❌ Failed to dump/write YAML: ${e.message}`); throw e; }
}

// Interfaz normalizada (debe definirse o importarse)
interface NormalizedOptions {
  projectName: string;
  projectRoot: string;
  projectDirectory: string;
  vpsName: string;
  parsedTags: string[];
  forceOverwrite?: boolean;
  vpsNameUpper: string;
}
