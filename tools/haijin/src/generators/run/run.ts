/**
 * Función para switchToBaseBranch mejorada que sincroniza con el branch original
 */
async function switchToBaseBranch(gitContext: GitContext): Promise<void> {
  const { git, originalBranch } = gitContext;

  try {
    // 1. Primero, asegurar que estamos en el branch original (main u otro)
    await git.checkout(originalBranch);
    logger.info(`Checked out original branch: ${originalBranch}`);

    // 2. Cambiar a base
    await git.checkout('base');
    logger.info('Switched to base branch');

    // 3. Sincronizar base con el branch original SOLO para plantillas y código del generador
    // Esto asegura que base tenga las últimas modificaciones del generador
    try {
      // NO fusionamos todo, solo sincronizamos las carpetas de plantillas y generadores
      // Esto evita que otros cambios en main afecten la generación
      logger.info(`Synchronizing generator templates from ${originalBranch} to base...`);

      // Identificar las rutas de plantillas (ajustar según tu estructura)
      const templatePaths = [
        'tools/haijin/src/generators/transcribe/files'
      ];

      // Checkout selectivo de esas rutas desde el branch original
      for (const templatePath of templatePaths) {
        try {
          await git.checkout([originalBranch, '--', templatePath]);
          logger.info(`Updated ${templatePath} from ${originalBranch}`);
        } catch (checkoutError) {
          logger.warn(`Could not update ${templatePath}: ${checkoutError.message}`);
        }
      }

      // Verificar si hay cambios
      const status = await git.status();
      if (status.files.length > 0) {
        await git.add('.');
        await git.commit(`Sync generator templates from ${originalBranch}`);
        logger.info('Committed template updates to base branch');
      } else {
        logger.info('No template changes detected');
      }
    } catch (syncError) {
      logger.warn(`Warning: Could not fully synchronize templates: ${syncError.message}`);
      logger.info('Continuing with generation...');
    }
  } catch (error) {
    logger.error(`Failed to prepare base branch: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

/**
 * Limpia un directorio de servicio en base usando git rm de forma más agresiva
 */
async function cleanServiceDirectory(serviceDir: string): Promise<void> {
  const servicePath = path.join(process.cwd(), serviceDir);
  const git = simpleGit(process.cwd());

  try {
    if (fs.existsSync(servicePath)) {
      // Método 1: Intentar git rm de forma agresiva
      try {
        // Usar -rf para forzar la eliminación
        await git.raw(['rm', '-rf', serviceDir]);
        logger.info(`Git removed directory: ${serviceDir}`);
      } catch (rmError) {
        logger.warn(`Git rm failed: ${rmError.message}`);

        // Método 2: Backup - eliminación manual + git add
        try {
          // Eliminar físicamente
          fs.removeSync(servicePath);
          logger.info(`Manually removed directory: ${serviceDir}`);

          // Indicar a Git que registre esta eliminación
          await git.add([serviceDir]);
          logger.info(`Added removal to Git index: ${serviceDir}`);
        } catch (fsError) {
          logger.error(`Manual cleanup failed: ${fsError.message}`);
        }
      }
    }

    // Recrear el directorio vacío
    fs.mkdirSync(servicePath, { recursive: true });
    logger.info(`Created fresh directory: ${serviceDir}`);

  } catch (error) {
    logger.error(`Failed to clean directory ${serviceDir}: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}
