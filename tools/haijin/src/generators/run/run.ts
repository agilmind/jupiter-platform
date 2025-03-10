import { logger, Tree } from '@nx/devkit';
import { TranscribeGeneratorSchema } from '../transcribe/schema';
import { RunGeneratorSchema } from './schema';
import { userPrompt } from './userPrompts';
import * as path from 'path';
import { NxProjectGit } from '../utils/git-handler';
import * as fs from 'fs-extra';
import transcribe from '../transcribe/transcribe';


export default async function (
  tree: Tree,
  options: RunGeneratorSchema
) {
  await userPrompt(options, tree);
  const directoryPrefix = options.currentServiceType === 'apollo-prisma' ? 'services' : 'apps';

  const projectDir = `${directoryPrefix}/${options.currentService}`;
  const projectRoot = path.join(process.cwd(), projectDir);

  try {
    // 1. Generar el Tree en memoria usando transcribe
    logger.info('Generating project structure in memory...');
    const transcribeOptions: TranscribeGeneratorSchema = {
      name: options.name,
      runOptions: options
    };

    await transcribe(tree, transcribeOptions);
    const changesCount = tree.listChanges().length;
    logger.info(`Generated ${changesCount} files in memory`);

    // 2. Preparar las operaciones Git
    const projectGit = new NxProjectGit(process.cwd(), projectDir);
    const originalBranch = await projectGit.getCurrentBranch();
    logger.info(`Starting Git operations (current branch: ${originalBranch})`);

    let projectExists = false;

    // 3. Cambiar al branch base (donde escribiremos los archivos) y prepararlo
    try {
      // Asegurarse de que las ramas base y develop existen
      await projectGit.ensureBranches();

      // Cambiar a la rama base
      await projectGit.rootGit.git.checkout('base');
      logger.info('Switched to base branch');

      // Verificar si el proyecto ya existe
      projectExists = fs.existsSync(projectRoot);

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
          // Volver al branch original si se cancela
          await projectGit.rootGit.git.checkout(originalBranch);
          logger.info('Update cancelled. Returning to original branch.');
          return;
        }

        logger.info(`Updating ${options.currentService}`);
      } else {
        logger.info(`Creating ${options.currentService}`);
      }

      // Limpiar directorio en base si existe
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

      // 4. IMPORTANTE: Aquí terminamos nuestra preparación
      // NX escribirá automáticamente los archivos en el branch 'base' cuando finalice el generador
      logger.info(`Tree ready. NX will write ${changesCount} files to the base branch upon completion.`);

      // 5. Devolver la función de callback que se ejecutará DESPUÉS de que NX escriba al disco
      return async () => {
        try {
          logger.info('Post-generation operations starting...');

          // 5.1 Git add y commit en branch base - SOLO los archivos del proyecto
          const action = projectExists ? 'Update' : 'Add';

          // Estamos en base, verificamos para estar seguros
          const currentBranch = await projectGit.getCurrentBranch();
          if (currentBranch !== 'base') {
            await projectGit.rootGit.git.checkout('base');
          }

          // Añadir específicamente los archivos del proyecto
          await projectGit.rootGit.git.add([projectDir]);

          // Verificar si hay cambios para commit
          const status = await projectGit.rootGit.git.status();
          const filesToCommit = status.files.filter(f => f.path.startsWith(projectDir));

          if (filesToCommit.length > 0) {
            const commitMsg = `${action} ${options.currentService} ${options.currentServiceType}: ${options.name}`;
            await projectGit.rootGit.git.commit(commitMsg);
            logger.info(`Changes committed to base branch`);
          } else {
            logger.info('No changes to commit');
          }

          // 5.2 Pasar cambios a develop
          let conflictsDetected = false;
          let patchFile = null;

          if (projectExists) {
            // Si ya existía, usar patch para aplicar los cambios
            try {
              const patchSuccess = await projectGit.patchToDevelop();
              // Si hay un archivo de patch generado, lo guardamos para limpiarlo después
              const possiblePatchFile = path.join(process.cwd(), `${path.basename(projectDir)}-manual-patch.patch`);
              if (fs.existsSync(possiblePatchFile)) {
                patchFile = possiblePatchFile;
              }

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
                // Si todo fue exitoso y encontramos el archivo de patch, lo eliminamos
                if (patchFile && fs.existsSync(patchFile)) {
                  fs.unlinkSync(patchFile);
                  logger.info(`Removed patch file: ${patchFile}`);
                }
              }
            } catch (patchError) {
              logger.error(`Error applying patch: ${patchError.message}`);
              conflictsDetected = true;
            }
          } else {
            // Si es nuevo, usar rebase para sincronizar
            try {
              const rebaseSuccess = await projectGit.rebaseToDevelop();
              // Si hay un archivo de patch generado, lo guardamos para limpiarlo después
              const possiblePatchFile = path.join(process.cwd(), `${path.basename(projectDir)}-conflict-resolution.patch`);
              if (fs.existsSync(possiblePatchFile)) {
                patchFile = possiblePatchFile;
              }

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
                // Si todo fue exitoso y encontramos el archivo de patch, lo eliminamos
                if (patchFile && fs.existsSync(patchFile)) {
                  fs.unlinkSync(patchFile);
                  logger.info(`Removed patch file: ${patchFile}`);
                }
              }
            } catch (rebaseError) {
              logger.error(`Error during rebase: ${rebaseError.message}`);
              conflictsDetected = true;
            }
          }

          // 5.3 Si hay conflictos, no continuar con el flujo normal y quedarse en develop
          if (conflictsDetected) {
            // Asegurarse de que estamos en develop para resolver conflictos
            const currentBranch = await projectGit.getCurrentBranch();
            if (currentBranch !== 'develop') {
              await projectGit.rootGit.git.checkout('develop');
            }
            logger.info('Please resolve conflicts in develop branch');
            return;
          }

          // 5.4 Si no hay conflictos, volver al branch original
          if (originalBranch && originalBranch !== 'base' && originalBranch !== 'develop') {
            await projectGit.rootGit.git.checkout(originalBranch);
            logger.info(`Returned to original branch: ${originalBranch}`);
          }

          const resultAction = projectExists ? 'updated' : 'created';
          logger.info(`✅ ${options.currentService} ${options.currentServiceType} ${options.name} ${resultAction} successfully!`);
        } catch (callbackError) {
          logger.error(`Post-generation operations failed: ${callbackError instanceof Error ? callbackError.message : String(callbackError)}`);

          // En caso de error, intentamos quedarnos en develop si es posible
          try {
            await projectGit.rootGit.git.checkout('develop');
            logger.info('Switched to develop branch to handle error');
          } catch (checkoutError) {
            // Si no podemos cambiarnos a develop, intentamos volver al branch original
            if (originalBranch) {
              try {
                await projectGit.rootGit.git.checkout(originalBranch);
                logger.info(`Returned to original branch: ${originalBranch}`);
              } catch (finalError) {
                logger.error(`Failed to return to any branch: ${finalError.message}`);
              }
            }
          }
        }
      };
    } catch (gitError) {
      // Si falla algo durante las operaciones Git iniciales
      logger.error(`Git operations failed: ${gitError instanceof Error ? gitError.message : String(gitError)}`);

      // Intentar volver al branch original
      if (originalBranch) {
        try {
          await projectGit.rootGit.git.checkout(originalBranch);
          logger.info(`Returned to original branch: ${originalBranch}`);
        } catch (checkoutError) {
          logger.error(`Failed to return to original branch: ${checkoutError.message}`);
        }
      }

      throw new Error(`Failed to prepare Git environment: ${gitError instanceof Error ? gitError.message : String(gitError)}`);
    }
  } catch (error) {
    logger.error(`Project generation failed: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}
