import { Tree, logger, readNxJson } from '@nx/devkit';
import * as yaml from 'js-yaml';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NormalizedOptions } from './types';

// Interfaces y helpers (getDefaultBranch, readWorkflowScript) como estaban antes...
interface VpsCreateGeneratorSchema {
  name: string;
  directory?: string;
  tags?: string;
  forceOverwrite?: boolean;
}

function getDefaultBranch(tree: Tree): string { /* ... */
  try {
    const p = JSON.parse(tree.read('nx.json', 'utf-8') || '{}');
    return p?.defaultBase || 'main';
  } catch {
    return 'main';
  }
}

const SCRIPTS_DIR = join(__dirname, 'scripts');

function readWorkflowScript(scriptName: string): string { /* ... */
  try {
    return readFileSync(join(SCRIPTS_DIR, scriptName), 'utf-8');
  } catch (e: any) {
    logger.error(`Read ${scriptName} failed: ${e.message}`);
    throw e;
  }
}


const WORKFLOW_PATH = '.github/workflows/cd-deploy.yml';

export async function updateCdWorkflow(
  tree: Tree,
  normalizedOptions: NormalizedOptions,
) {
  logger.info(`Checking/Updating GitHub workflow at: ${WORKFLOW_PATH}`);
  let workflow: Record<string, any> = {};

  // Leer y parsear YAML existente... (igual que antes)
  if (tree.exists(WORKFLOW_PATH)) { /* ... parse logic ... */
  } else { /* ... */
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
  // ... (Configuración del job 'determine-affected' como en la versión anterior, incluyendo el step para instalar jq y el step 'Calculate Affected VPS Projects' que lee calculate-affected.sh) ...
  determineAffectedJob.name = 'Determine Affected VPS Projects';
  determineAffectedJob['runs-on'] = 'ubuntu-latest';
  determineAffectedJob.outputs = {
    affected_matrix: '${{ steps.set-matrix.outputs.matrix }}',
    has_affected: '${{ steps.set-matrix.outputs.has_affected }}',
  };
  determineAffectedJob.steps = [
    { name: 'Checkout Repository (Fetch Full History)', uses: 'actions/checkout@v4', with: { 'fetch-depth': 0 } },
    { name: 'Clear Nx Cache', run: 'rm -rf node_modules/.cache/nx' },
    {
      name: 'Derive Appropriate SHAs for Nx Affected',
      uses: 'nrwl/nx-set-shas@v4', // O '@nx/nx-set-shas@vX' donde X es la última versión
      with: {
        // Opcional: especifica tu rama principal si no es 'main' o la detecta mal
        // 'main-branch-name': 'tu-rama-main'
      },
    },
    { name: 'Setup Node.js', uses: 'actions/setup-node@v4', with: { 'node-version': '20', cache: 'npm' } },
    { name: 'Install Dependencies', run: 'npm ci' },
    { name: 'Install jq (for JSON processing)', run: 'sudo apt-get update && sudo apt-get install -y jq' },
    {
      name: 'Calculate Affected VPS Projects',
      id: 'set-matrix',
      run: readWorkflowScript('calculate-affected.sh'), // Asegúrate que lee el ARCHIVO NUEVO
      env: {
        NX_BASE: '${{ env.NX_BASE }}',
        NX_HEAD: '${{ env.NX_HEAD }}',
        AFFECTED_JSON: '', // Definido aquí pero poblado por el script
      },
    },
  ];
  workflow.jobs['determine-affected'] = determineAffectedJob;


  // --- Job: deploy ---
  const deployJob = workflow.jobs['deploy'] ?? {};
  deployJob.name = deployJob.name ?? 'Deploy Affected VPS Configurations';
  deployJob.needs = deployJob.needs ?? 'determine-affected';
  deployJob.if = deployJob.if ?? '\${{ needs.determine-affected.outputs.has_affected == \'true\' }}';
  deployJob.environment = { name: 'vps-production' }; // Apuntar al environment
  deployJob['runs-on'] = deployJob['runs-on'] ?? 'ubuntu-latest';
  deployJob.strategy = deployJob.strategy ?? {
    'fail-fast': false,
    matrix: '${{ fromJson(needs.determine-affected.outputs.affected_matrix) }}',
  };
  deployJob.env = {
    SECRET_NAME_HOST: 'VPS_${{ matrix.vps_name_upper }}_HOST',
    SECRET_NAME_USER: 'VPS_${{ matrix.vps_name_upper }}_USER',
    SECRET_NAME_KEY: 'VPS_${{ matrix.vps_name_upper }}_KEY',
  };

  deployJob.steps = [
      {
         name: 'Checkout Repository',
         uses: 'actions/checkout@v4'
      },
    {
      name: 'Log Deployment Target',
      run: 'echo "Deploying project ${{ matrix.vps_name }} to host <span class="math-inline">\{\{ secrets\[env\.SECRET\_NAME\_HOST\] \}\}\.\.\."'
    },
    {
       name: 'Setup SSH Agent',
       uses: 'webfactory/ssh-agent@v0.9.0',
       with: {
         'ssh-private-key': "\${{ secrets[env.SECRET_NAME_KEY] }}",
       },
    },      {
         name: 'Add VPS Host to Known Hosts',
         run: `
          VPS_HOST="\${{ secrets[env.SECRET_NAME_HOST] }}"
          if [ -z "$VPS_HOST" ]; then echo "Error: VPS host secret missing." >&2; exit 1; fi
          mkdir -p ~/.ssh
          chmod 700 ~/.ssh
          ssh-keyscan -H "$VPS_HOST" >> ~/.ssh/known_hosts
          chmod 600 ~/.ssh/known_hosts
          echo "Added $VPS_HOST to known_hosts"
         `,
      },
      {
        name: 'Install rsync (on runner)',
        run: 'sudo apt-get update && sudo apt-get install -y rsync',
      },
      {
         name: 'Sync Files via Rsync',
         run:`
          # Pasos de depuración (mantener por ahora)
          echo "--- Debugging Rsync ---"
          echo "PATH is: $PATH"
          echo "Checking for rsync command using 'command -v':"
          RSYNC_PATH=$(command -v rsync) || { echo "ERROR: rsync command not found by 'command -v'!"; exit 1; }
          echo "rsync found at: $RSYNC_PATH"
          echo "Attempting to get rsync version:"
          "$RSYNC_PATH" --version
          RSYNC_VERSION_EXIT_CODE=$?
          echo "rsync --version exit code: $RSYNC_VERSION_EXIT_CODE"
          if [ $RSYNC_VERSION_EXIT_CODE -ne 0 ]; then echo "ERROR: executing '$RSYNC_PATH --version' failed!"; exit 1; fi
          echo "rsync seems executable. Proceeding..."
          echo "--- End Debugging ---"

          # Definir variables
          VPS_HOST="\${{ secrets[env.SECRET_NAME_HOST] }}"
          SECRET_USER_VALUE="\${{ secrets[env.SECRET_NAME_USER] }}"
          VPS_USER="\${SECRET_USER_VALUE:-deploy}"
          PROJECT_NAME="\${{ matrix.vps_name }}"
          TARGET_DIR="/home/\${VPS_USER}/apps/\${PROJECT_NAME}"
          SOURCE_DIR="./apps/\${PROJECT_NAME}/"

          if [ ! -d "$SOURCE_DIR" ]; then echo "Error: Source directory $SOURCE_DIR not found." >&2; exit 1; fi

          echo "Syncing $SOURCE_DIR to $VPS_USER@$VPS_HOST:$TARGET_DIR/"

          # --- Ejecutar rsync usando ruta absoluta y EN UNA SOLA LÍNEA ---
          echo "Executing: /usr/bin/rsync -avzL --delete --exclude='.git' $SOURCE_DIR $VPS_USER@$VPS_HOST:$TARGET_DIR/"
          /usr/bin/rsync -avzL --delete --exclude='.git' "$SOURCE_DIR" "$VPS_USER@$VPS_HOST:$TARGET_DIR/" || { echo "Rsync failed! Exit code: $?"; exit 1; }
          echo "Rsync finished."
         `,
      },
      {
         name: 'Execute Remote Deployment Script',
         run: `
          VPS_HOST="\${{ secrets[env.SECRET_NAME_HOST] }}"
          SECRET_USER_VALUE="\${{ secrets[env.SECRET_NAME_USER] }}"
          VPS_USER="\${SECRET_USER_VALUE:-deploy}"
          PROJECT_NAME="\${{ matrix.vps_name }}"
          REMOTE_APP_DIR="/home/\${VPS_USER}/apps/\${PROJECT_NAME}"
          REMOTE_SCRIPT_PATH="\${REMOTE_APP_DIR}/deploy.sh"

          echo "Executing $REMOTE_SCRIPT_PATH on $VPS_USER@$VPS_HOST..."
          ssh "$VPS_USER@$VPS_HOST" << EOF
            echo "[Remote] Executing deploy script for $PROJECT_NAME..."
            cd "$REMOTE_APP_DIR" || { echo "[Remote] Failed to cd to $REMOTE_APP_DIR"; exit 1; }
            bash deploy.sh
            SCRIPT_EXIT_CODE=$?
            echo "[Remote] deploy.sh finished with exit code $SCRIPT_EXIT_CODE."
            exit $SCRIPT_EXIT_CODE
          EOF
          SSH_EXIT_CODE=$?
          if [ $SSH_EXIT_CODE -ne 0 ]; then echo "Remote script execution failed with exit code $SSH_EXIT_CODE!"; exit $SSH_EXIT_CODE; fi
          echo "Remote script executed successfully."
         `,
      },
  ];

  workflow.jobs['deploy'] = deployJob;
  logger.info(`Job 'deploy' configured with REAL deployment steps targeting environment 'vps-production'.`);

  // --- Escribir YAML (igual que antes) ---
  try {
    const yamlContent = yaml.dump(workflow, { lineWidth: -1, noRefs: true, quotingType: '"', forceQuotes: false });
    tree.write(WORKFLOW_PATH, yamlContent);
    logger.info(`Successfully wrote updated workflow to ${WORKFLOW_PATH}`);
  } catch (e: any) {
    logger.error(`❌ Failed to dump/write YAML: ${e.message}`);
    throw e;
  }
}
