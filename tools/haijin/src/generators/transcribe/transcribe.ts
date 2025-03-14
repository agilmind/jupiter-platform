import { Tree, formatFiles, generateFiles, logger } from '@nx/devkit';
import * as path from 'path';
import { TranscribeGeneratorSchema } from './schema';
import { customGenerateFiles } from './customGenerateFiles';
import { revertGeneratedFiles } from './revertGeneratedFiles';

export default async function (tree: Tree, options: TranscribeGeneratorSchema) {
  if (!options.runOptions) {
    throw new Error(`Este generador se ejecuta únicamente invocado por el generador haijin:run`);
  }
  let ctx;
  try {
    logger.info(`Iniciando transcribe`);
    const templatePath = path.join(__dirname, 'files', options.runOptions.currentServiceType);

    const directoryPrefix = options.runOptions.currentServiceType === 'apollo-prisma' ? 'services' : 'apps';
    const targetDir = path.join(
      directoryPrefix,
      options.runOptions.currentService
    );
    logger.info(`Transcribiendo en: ${targetDir}`);
    ctx = { templatePath, targetDir };

    generateFiles(
      tree,
      templatePath,
      targetDir,
      options.runOptions
    );
    await formatFiles(tree);
    await customGenerateFiles(tree, options, targetDir)


    return () => {
        logger.info(`Transcripción completada`);
    };
  } catch (error) {
    logger.error(`Error en el generador Transcribe: ${error instanceof Error ? error.message : String(error)}`);
    if (ctx) {
      revertGeneratedFiles(
        tree,
        ctx.templatePath,
        ctx.targetDir,
        options.runOptions
      );
    }
    throw error;
  }
}
