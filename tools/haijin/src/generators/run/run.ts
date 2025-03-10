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
      await projectGit.git.checkout('base');
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
          await projectGit.git.checkout(originalBranch);
          logger.info('Update cancelled. Returning to original branch.');
          return;
        }

        logger.info(`Updating ${options.currentService}`);
      } else {
        logger.info(`Creating ${options.currentService}`);
      }

      await projectGit.cleanProjectDirectory();

      // 4. IMPORTANTE: Aquí terminamos nuestra preparación
      // NX escribirá automáticamente los archivos en el branch 'base' cuando finalice el generador
      logger.info(`Tree ready. NX will write ${changesCount} files to the base branch upon completion.`);

      // 5. Devolver la función de callback que se ejecutará DESPUÉS de que NX escriba al disco
      return async () => {
        let mergeSuccess = false;

        try {
          logger.info('Post-generation operations starting...');

          // 5.1 Git add y commit en branch base - SOLO los archivos del proyecto
          const action = projectExists ? 'Update' : 'Add';

          // Estamos en base, verificamos para estar seguros
          const currentBranch = await projectGit.getCurrentBranch();
          if (currentBranch !== 'base') {
            await projectGit.git.checkout('base');
          }

          // Añadir específicamente los archivos del proyecto
          await projectGit.git.add([projectDir]);

          // Verificar si hay cambios para commit
          const status = await projectGit.git.status();
          const filesToCommit = status.files.filter(f => f.path.startsWith(projectDir));

          if (filesToCommit.length > 0) {
            const commitMsg = `${action} ${options.currentService} ${options.currentServiceType}: ${options.name}`;
            await projectGit.git.commit(commitMsg);
            logger.info(`Changes committed to base branch`);
          } else {
            logger.info('No changes to commit');
          }

          // 5.2 Pasar cambios a develop usando merge
          mergeSuccess = await projectGit.patchToDevelop(); // Este método ahora usa merge internamente

          // 5.3 Decisión sobre qué branch dejamos activo al finalizar
          if (!mergeSuccess) {
            // Verificar explícitamente que estamos en develop
            const currentBranch = await projectGit.getCurrentBranch();
            if (currentBranch !== 'develop') {
              await projectGit.git.checkout('develop');
            }

            logger.info('You are now in develop branch. Please resolve merge conflicts before continuing.');
            return; // Terminar aquí para evitar cualquier intento de volver al branch original
          }

          // 5.4 Si todo fue bien (sin conflictos), volver al branch original solo si no es base
          if (originalBranch && originalBranch !== 'base') {
            await projectGit.git.checkout(originalBranch);
            logger.info(`Returned to original branch: ${originalBranch}`);
          }

          const resultAction = projectExists ? 'updated' : 'created';
          logger.info(`✅ ${options.currentService} ${options.currentServiceType} ${options.name} ${resultAction} successfully!`);
        } catch (callbackError) {
          logger.error(`Post-generation operations failed: ${callbackError instanceof Error ? callbackError.message : String(callbackError)}`);

          // En caso de error, asegurarse de estar en develop
          try {
            // Si hubo un intento de merge con conflictos, debemos permanecer en develop
            if (!mergeSuccess) {
              const currentBranch = await projectGit.getCurrentBranch();
              if (currentBranch !== 'develop') {
                await projectGit.git.checkout('develop');
                logger.info('Switched to develop branch to handle conflicts');
              }
            }
            // En otros casos de error, también preferimos develop para facilitar depuración
            else {
              await projectGit.git.checkout('develop');
              logger.info('Switched to develop branch to handle error');
            }
          } catch (checkoutError) {
            logger.error(`Failed to switch to develop branch: ${checkoutError.message}`);
            // Solo como último recurso, intentar volver al branch original
            if (originalBranch) {
              try {
                await projectGit.git.checkout(originalBranch);
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
          await projectGit.git.checkout(originalBranch);
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
