import { Tree, formatFiles, generateFiles, logger } from '@nx/devkit';
import * as path from 'path';
import { TranscribeGeneratorSchema } from './schema';

export default async function (tree: Tree, options: TranscribeGeneratorSchema) {
  if (!options.runOptions) {
    throw new Error(`Este generador se ejecuta únicamente invocado por el generador haijin:run`);
  }
  try {
    logger.info(`Iniciando transcribe`);
    const templatePath = path.join(__dirname, 'files', options.runOptions.currentServiceType);

    const directoryPrefix = options.runOptions.currentServiceType === 'apollo-prisma' ? 'services' : 'apps';
    const targetDir = path.join(
      directoryPrefix,
      options.runOptions.currentService
    );
    logger.info(`Procesando plantillas desde: ${templatePath}`);
    logger.info(`Destino: ${targetDir}`);

    generateFiles(
      tree,
      templatePath,
      targetDir,
      options.runOptions
    );
    await formatFiles(tree);

    return () => {
        logger.info(`Simulación de generación completada`);
    };
  } catch (error) {
    logger.error(`Error en el generador Transcribe: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}
