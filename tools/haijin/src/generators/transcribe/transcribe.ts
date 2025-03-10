import { Tree, formatFiles, generateFiles, logger } from '@nx/devkit';
import * as path from 'path';
import { TranscribeGeneratorSchema } from './schema';

export default async function (tree: Tree, options: TranscribeGeneratorSchema) {
  if (!options.runOptions) {
    throw new Error(`Este generador se ejecuta únicamente invocado por el generador haijin:run`);
  }

  try {
    logger.info(`Iniciando transcribe (dryRun: ${options.dryRun ? 'true' : 'false'})`);

    // Obtener la ruta a las plantillas
    const templatePath = path.join(__dirname, 'files', options.runOptions.currentServiceType);

    const directoryPrefix = options.runOptions.currentServiceType === 'apollo-prisma' ? 'services' : 'apps';
    const targetDir = path.join(
      directoryPrefix,
      options.runOptions.currentService
    );

    logger.info(`Procesando plantillas desde: ${templatePath}`);
    logger.info(`Destino: ${targetDir}`);

    // Generar archivos en el Tree (no escribe a disco todavía)
    generateFiles(
      tree,
      templatePath,
      targetDir,
      options.runOptions
    );

    // Formatear los archivos en el Tree
    await formatFiles(tree);

    const changesCount = tree.listChanges().length;
    logger.info(`Se procesaron ${changesCount} archivos en el Tree`);

    return () => {
      if (options.dryRun) {
        logger.info(`Simulación de generación completada - ${changesCount} archivos listos en el Tree (no escritos en disco)`);
      } else {
        logger.info(`Generación completada - ${changesCount} archivos generados y escritos en disco`);
      }
    };
  } catch (error) {
    logger.error(`Error en el generador Transcribe: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}
