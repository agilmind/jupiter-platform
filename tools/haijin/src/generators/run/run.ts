import { logger, Tree } from '@nx/devkit';
import { TranscribeGeneratorSchema } from '../transcribe/schema';
import { RunGeneratorSchema } from './schema';
import { userPrompt } from './userPrompts';
import * as path from 'path';
import { execSync } from 'child_process';
import { NxProjectGit } from '../utils/git-handler';
import * as fs from 'fs-extra';
import transcribe from '../transcribe/transcribe';


export default async function (
  tree: Tree,
  options: RunGeneratorSchema
) {
  await userPrompt(options, tree);
  const directoryPrefix = options.currentServiceType === 'apollo-prisma' ? 'services' : 'apps';

  const projectDir = `${directoryPrefix}/${options.name}`;
  const projectRoot = path.join(process.cwd(), projectDir);

  try {
    // Verificar si el proyecto ya existe
    const projectExists = fs.existsSync(projectRoot);

    if (projectExists) {
      // Preguntar si quiere actualizar el proyecto existente
      const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
      });

      const answer = await new Promise<string>(resolve => {
        readline.question(`Project ${options.name} already exists. Do you want to update it? (y/N): `, resolve);
      });

      readline.close();

      if (answer.toLowerCase() !== 'y') {
        logger.info('Update cancelled. Exiting...');
        return;
      }

      logger.info(`Updating ${options.currentService}`);
    } else if (!projectExists) {
      logger.info(`Creating ${options.currentService}`);
    }

    return async () => {
      // Guardar la rama original
      const originalBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
      logger.info(`Starting Git operations (current branch: ${originalBranch})`);

      // Inicializar GitExtender con el directorio del workspace y el directorio del proyecto
      const projectGit = new NxProjectGit(process.cwd(), projectDir);

      try {
        // 1. Asegurarse de que las ramas base y develop existen
        await projectGit.ensureBranches();

        // 2. Eliminar archivos en la rama actual para poder cambiar a base
        if (fs.existsSync(projectRoot)) {
          logger.info(`Removing files in current branch before checkout...`);
          fs.removeSync(projectRoot);
        }

        // 3. Cambiar a la rama base
        await projectGit.rootGit.git.checkout('base');
        logger.info('Switched to base branch');

        // 4. Limpiar directorio en base si existe
        try {
          await projectGit.rootGit.git.rm(['-r', `${projectDir}/*`]);
          logger.info('Cleaned existing files in base branch');
        } catch (rmError) {
          if (rmError.message.includes('did not match any files')) {
            logger.info('No existing files to clean in base branch');
          } else {
            throw rmError;
          }
        }

        const transcribeOptions: TranscribeGeneratorSchema = {
          name: options.name,
          dryRun: true,
          runOptions: options
        };

        await transcribe(tree, transcribeOptions);

        // 6. Git add y commit
        const action = projectExists ? 'Update' : 'Add';
        await projectGit.addAndCommit(`${action} ${options.currentService} ${options.currentServiceType}: ${options.name}`);
        logger.info(`Changes committed to base branch`);

        // 7. Pasar cambios a develop
        let conflictsDetected = false;

        if (projectExists) {
          // Si ya existía, usar patch para aplicar los cambios
          const patchSuccess = await projectGit.patchToDevelop();
          if (!patchSuccess) {
            conflictsDetected = true;
            logger.warn(`
==========================================================================
⚠️ ATENCIÓN: CONFLICTO EN LA APLICACIÓN DEL PARCHE

Se encontraron conflictos al intentar aplicar el parche a la rama develop.
Por favor, sigue las instrucciones anteriores para resolver los conflictos.

Una vez resueltos los conflictos, el proyecto estará actualizado en develop.
Los archivos ya fueron actualizados correctamente en la rama base.
==========================================================================`);
          } else {
            logger.info('Applied patch to develop branch');
          }
        } else {
          // Si es nuevo, usar rebase para sincronizar
          const rebaseSuccess = await projectGit.rebaseToDevelop();

          if (!rebaseSuccess) {
            conflictsDetected = true;
            logger.warn(`
==========================================================================
⚠️ ATENCIÓN: CONFLICTO DE REBASE DETECTADO

Se encontraron conflictos al intentar aplicar los cambios a la rama develop.
Por favor, sigue las instrucciones anteriores para resolver los conflictos.

Una vez resueltos todos los conflictos y completado el rebase, el proyecto
estará actualizado en la rama develop.

Los archivos ya fueron actualizados correctamente en la rama base.
==========================================================================`);
          } else {
            logger.info('Rebased changes to develop branch');
          }
        }

        // Si hay conflictos, no continuar con el flujo normal
        if (conflictsDetected) {
          // No volver a la rama original - dejar al usuario en el estado actual
          // para que pueda resolver los conflictos
          return;
        }

        // 8. Volver a la rama original
        if (originalBranch && originalBranch !== 'base' && originalBranch !== 'develop') {
          await projectGit.rootGit.git.checkout(originalBranch);
          logger.info(`Returned to original branch: ${originalBranch}`);
        }

        const resultAction = projectExists ? 'updated' : 'created';
        logger.info(`✅ ${options.currentService} ${options.currentServiceType} ${options.name} ${resultAction} successfully!`);
      } catch (error) {
        logger.error(`Git operations failed: ${error instanceof Error ? error.message : String(error)}`);

        // Intentar volver a la rama original
        if (originalBranch) {
          try {
            await projectGit.rootGit.git.checkout(originalBranch);
            logger.info(`Returned to original branch: ${originalBranch}`);

            // Eliminar archivos del proyecto en la rama original
            if (fs.existsSync(projectRoot)) {
              logger.info(`Removing generated files from ${originalBranch} branch...`);
              fs.removeSync(projectRoot);
            }
          } catch (checkoutError) {
            logger.error(`Failed to return to original branch: ${checkoutError.message}`);
          }
        }

        throw new Error(`Failed to ${projectExists ? 'update' : 'create'} ${options.currentService} ${options.currentServiceType}: ${error instanceof Error ? error.message : String(error)}`);
      }
    };
  } catch (error) {
    logger.error(`Project generation failed: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}
