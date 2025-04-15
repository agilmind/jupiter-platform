import {
  Tree,
  logger,
  readProjectConfiguration,
  formatFiles, // Opcional para formateo final
  workspaceRoot, // Necesario para la ruta de ejecución
} from '@nx/devkit';
import { execSync } from 'node:child_process'; // Usaremos execSync
import { VpsRemoveInfraSchema } from './schema';

// Helpers simples para logs
function success(message: string) { logger.info(`✅ ${message}`); }
function warn(message: string) { logger.warn(`⚠️ ${message}`); }
function error(message: string) { logger.error(`❌ ${message}`); }

export default async function vpsRemoveGenerator(
  tree: Tree,
  options: VpsRemoveInfraSchema
): Promise<void> {
  // projectName es el nombre del proyecto Nx registrado (ej: 'infra')
  const projectName = options.projectName;

  logger.info(`Attempting to remove infrastructure project '${projectName}' from the Nx workspace...`);

  // 1. Verificar que el proyecto Nx exista
  let projectRoot = '';
  try {
    const projectConfig = readProjectConfiguration(tree, projectName);
    projectRoot = projectConfig.root; // Guardar la ruta para el mensaje final
    logger.info(`Nx project '${projectName}' found at '${projectRoot}'. Proceeding with removal from workspace.`);
  } catch (e) {
    error(`Project '${projectName}' not found in Nx workspace configuration.`);
    warn('No changes were made.');
    return; // Salir si no existe
  }

  // 2. Delegar al generador @nx/workspace:remove via execSync
  // Este comando maneja la eliminación de archivos y la limpieza de la configuración Nx
  const force = options.forceRemove ?? false;
  // El generador de Nx usa --force como opción CLI
  const command = `npx nx g @nx/workspace:remove ${JSON.stringify(projectName)} --force=${force}`;

  logger.info(`Executing command: ${command}`);
  try {
    // Ejecutar y mostrar salida/errores/prompts del comando hijo
    execSync(command, { cwd: workspaceRoot, stdio: 'inherit' });
    logger.info(`Nx remove command completed successfully for project '${projectName}'.`);
  } catch (e: any) {
    error(`Command failed: ${command}`);
    error(`Error during command execution. Workspace removal might be incomplete.`);
    // Es útil relanzar el error para que Nx sepa que el generador falló
    throw e;
  }

  // 3. Formateo Opcional
  // await formatFiles(tree);

  // 4. Mensaje Final Clarificando el Alcance
  success(`Infrastructure project '${projectName}' and its files at '${projectRoot}' removed successfully from the workspace.`);
  warn(`-----------------------------------------------------`);
  warn(`IMPORTANT: This ONLY removed files and Nx configuration from your LOCAL WORKSPACE.`);
  warn(`The deployed infrastructure stack on the VPS (if any) was NOT affected.`);
  warn(`To remove the deployed stack, connect to the VPS and run:`);
  warn(`  cd /home/deploy/${projectName}  # (Or the correct infra path, e.g., /home/deploy/infra)`);
  warn(`  docker compose -f docker-compose-infra.yml down -v`);
  warn(`  # Then optionally remove the directory:`);
  warn(`  # rm -rf /home/deploy/${projectName}`);
  warn(`-----------------------------------------------------`);
}
