import {
  Tree,
  logger,
  readProjectConfiguration,
  formatFiles, // Podemos mantenerlo para formatear al final si es necesario
  workspaceRoot, // Para obtener la ruta raíz del workspace
} from '@nx/devkit';
import { execSync } from 'node:child_process'; // Importamos execSync
import { VpsRemoveGeneratorSchema } from './schema';

// Helper function simulada para que no de error de compilación si no está definida
function success(message: string) {
    logger.info(`✅ ${message}`);
}
function warn(message: string) {
    logger.warn(`⚠️ ${message}`);
}


export default async function vpsRemoveGenerator(
  tree: Tree,
  options: VpsRemoveGeneratorSchema
): Promise<void> {
  const projectName = options.projectName;

  logger.info(`Attempting to remove VPS configuration project: ${projectName}...`);

  // 1. Verificar que el proyecto existe
  try {
    readProjectConfiguration(tree, projectName);
    logger.info(`Project '${projectName}' found. Proceeding with removal.`);
  } catch (e) {
    logger.error(`❌ Project '${projectName}' not found in workspace configuration.`);
    warn('No changes were made.');
    return; // Salir si el proyecto no existe
  }

  // 2. Delegar la eliminación ejecutando el comando CLI de Nx
  // Usamos @nx/workspace:remove que es el generador estándar para esto
  const force = options.forceRemove ?? false;
  // Construimos el comando. Usamos JSON.stringify para manejar nombres con espacios/caracteres especiales.
  // El comando se ejecuta desde la raíz del workspace.
  // NOTA: El generador @nx/workspace:remove usa '--force' y no '--forceRemove'
  const command = `npx nx g @nx/workspace:remove ${JSON.stringify(projectName)} --force=${force}`;

  logger.info(`Executing command: ${command}`);
  try {
    // Ejecutar sincrónicamente. stdio: 'inherit' muestra la salida/errores/prompts del comando hijo en nuestra consola.
    execSync(command, { cwd: workspaceRoot, stdio: 'inherit' });
    logger.info(`Nx remove command completed for project '${projectName}'.`);
  } catch (e: any) {
    logger.error(`❌ Command failed: ${command}`);
    // execSync lanza un error si el comando devuelve un código de salida distinto de 0
    // El error 'e' puede contener stdout/stderr si la configuración de stdio fuera diferente.
    logger.error(`Error during command execution. Removal might be incomplete. Check output above.`);
    // Relanzamos el error para que Nx sepa que el generador falló
    throw e;
  }

  // 3. Formatear Archivos (Opcional, el generador remove puede hacerlo)
  // Podríamos querer ejecutarlo para asegurar consistencia si otros archivos cambiaron indirectamente.
  // logger.info('Formatting workspace files...');
  // await formatFiles(tree);

  // 4. Nota sobre Workflow (igual que antes)
  logger.info(`NOTE: The CD workflow file (.github/workflows/cd-deploy.yml) was NOT modified.`);
  logger.info(`      The 'determine-affected' job will simply stop finding the removed project.`);

  success(`VPS configuration project '${projectName}' removal process finished.`);
}
