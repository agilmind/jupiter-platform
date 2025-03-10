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
    // Guardar la rama original
    const originalBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
    logger.info(`Starting Git operations (current branch: ${originalBranch})`);

    // Ejecutar transcribe con dryRun=true para generar los archivos en el Tree sin escribir al disco
    const transcribeOptions: TranscribeGeneratorSchema = {
      name: options.name,
      dryRun: true,
      runOptions: options
    };

    logger.info('Processing templates and updating Tree...');
    await transcribe(tree, transcribeOptions);
    logger.info('Templates processed successfully');

    // Capturar todos los cambios del Tree para escribirlos después
    const treeChanges = tree.listChanges().map(change => ({
      path: change.path,
      content: tree.read(change.path),
      type: change.type
    }));

    logger.info(`Captured ${treeChanges.length} files to write after branch switch`);

    // Inicializar GitExtender con el directorio del workspace y el directorio del proyecto
    const projectGit = new NxProjectGit(process.cwd(), projectDir);

    try {
      // 1. Asegurarse de que las ramas base y develop existen
      await projectGit.ensureBranches();

      // 2. Cambiar a la rama base
      await projectGit.rootGit.git.checkout('base');
      logger.info('Switched to base branch');

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
      } else {
        logger.info(`Creating ${options.currentService}`);
      }

      // 3. Limpiar directorio en base si existe
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

      // 4. Escribir los archivos del Tree al disco
      logger.info('Writing files to disk in base branch...');

      for (const change of treeChanges) {
        const filePath = change.path;
        const fileDir = path.dirname(filePath);

        // Asegurarse de que el directorio existe
        fs.ensureDirSync(fileDir);

        // Escribir el archivo
        if (Buffer.isBuffer(change.content)) {
          fs.writeFileSync(filePath, change.content);
        } else if (typeof change.content === 'string') {
          fs.writeFileSync(filePath, change.content, 'utf-8');
        } else if (change.content !== null && change.content !== undefined) {
          fs.writeFileSync(filePath, String(change.content), 'utf-8');
        }

        logger.debug(`Written: ${filePath}`);
      }

      logger.info(`Successfully wrote ${treeChanges.length} files to disk`);

      // 5. Git add y commit
      const action = projectExists ? 'Update' : 'Add';
      await projectGit.addAndCommit(`${action} ${options.currentService} ${options.currentServiceType}: ${options.name}`);
      logger.info(`Changes committed to base branch`);

      // 6. Pasar cambios a develop
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

      // 7. Volver a la rama original
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
  } catch (error) {
    logger.error(`Project generation failed: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}
