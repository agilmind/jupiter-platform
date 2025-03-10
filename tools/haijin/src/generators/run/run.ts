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
  // 1. Solicitar al usuario que seleccione servicios
  await userPrompt(options, tree);
  const selectedServices = options.selectedServices || [];

  if (selectedServices.length === 0) {
    throw new Error('Debe seleccionar al menos un servicio para generar');
  }

  try {
    // 2. Obtener información sobre el branch original
    const rootPath = process.cwd();
    // Usamos el primer servicio para inicializar el objeto Git
    const firstService = selectedServices[0];
    const firstServiceType = options.services?.[firstService] || '';
    const directoryPrefix = firstServiceType === 'apollo-prisma' ? 'services' : 'apps';
    const projectDir = `${directoryPrefix}/${firstService}`;

    const projectGit = new NxProjectGit(rootPath, projectDir);
    const originalBranch = await projectGit.getCurrentBranch();
    logger.info(`Starting Git operations (current branch: ${originalBranch})`);

    // 3. Preparar los branches
    try {
      await projectGit.ensureBranches();

      // 4. Cambiar a branch base para generación
      await projectGit.git.checkout('base');
      logger.info('Switched to base branch');

      // 5. Verificar y procesar cada servicio seleccionado
      const servicesToProcess = [];

      for (const serviceName of selectedServices) {
        const serviceType = options.services?.[serviceName];
        if (!serviceType) {
          logger.warn(`No se pudo determinar el tipo para el servicio ${serviceName}, se omitirá`);
          continue;
        }

        const servicePrefix = serviceType === 'apollo-prisma' ? 'services' : 'apps';
        const serviceDir = `${servicePrefix}/${serviceName}`;
        const servicePath = path.join(rootPath, serviceDir);

        // Verificar si el servicio ya existe
        const serviceExists = fs.existsSync(servicePath);

        if (serviceExists) {
          // Preguntar si quiere actualizar este servicio existente
          const readline = require('readline').createInterface({
            input: process.stdin,
            output: process.stdout
          });

          const answer = await new Promise<string>(resolve => {
            readline.question(`El servicio ${serviceName} ya existe. ¿Desea actualizarlo? (y/N): `, resolve);
          });

          readline.close();

          if (answer.toLowerCase() !== 'y') {
            logger.info(`Omitiendo actualización de ${serviceName}`);
            continue;
          }

          logger.info(`Actualizando servicio: ${serviceName}`);
        } else {
          logger.info(`Creando nuevo servicio: ${serviceName}`);
        }

        // Limpiar directorio para este servicio
        const serviceGit = new NxProjectGit(rootPath, serviceDir);
        await serviceGit.cleanProjectDirectory();

        // Agregar a la lista de servicios a procesar
        servicesToProcess.push({
          name: serviceName,
          type: serviceType,
          dir: serviceDir,
          exists: serviceExists
        });
      }

      if (servicesToProcess.length === 0) {
        logger.info('No hay servicios para procesar. Finalizando.');

        // Volver al branch original
        await projectGit.git.checkout(originalBranch);
        return;
      }

      // 6. Crear una lista para recopilar todos los servicios generados
      // Importante: Debemos procesar todos los servicios AQUÍ, antes de que NX escriba al disco
      logger.info(`Generando ${servicesToProcess.length} servicios en el branch base...`);

      // 7. IMPORTANTE: Generar cada servicio en el Tree ANTES de devolver el callback
      for (const service of servicesToProcess) {
        // Crear un objeto options específico para este servicio
        const serviceOptions = {
          ...options,
          currentService: service.name,
          currentServiceType: service.type
        };

        // Configurar transcribe para este servicio
        const transcribeOptions: TranscribeGeneratorSchema = {
          name: options.name,
          runOptions: serviceOptions
        };

        // Ejecutar transcribe para este servicio (modifica el Tree)
        logger.info(`Processing templates for service: ${service.name}`);
        await transcribe(tree, transcribeOptions);
      }

      // 8. NX escribirá automáticamente los archivos en el branch 'base' cuando finalice el generador
      logger.info(`Tree ready. NX will write ${servicesToProcess.length} services to disk upon completion.`);

      // 9. Devolver la función de callback que se ejecutará DESPUÉS de que NX escriba al disco
      return async () => {
        try {
          logger.info('Post-generation operations starting...');

          // 10. Git add y commit en branch base - TODOS los directorios afectados
          const serviceDescriptions = servicesToProcess.map(s =>
            `${s.name} (${s.type})${s.exists ? ' (actualizado)' : ' (nuevo)'}`
          ).join(', ');

          const commitMessage = `Batch operation: Generated services - ${serviceDescriptions}`;

          // Verificar que estamos en base
          const currentBranch = await projectGit.getCurrentBranch();
          if (currentBranch !== 'base') {
            await projectGit.git.checkout('base');
          }

          // Añadir todos los directorios afectados
          for (const service of servicesToProcess) {
            await projectGit.git.add([service.dir]);
            logger.info(`Added ${service.dir} to commit`);
          }

          // Verificar si hay cambios para commit
          const status = await projectGit.git.status();

          if (status.files.length > 0) {
            await projectGit.git.commit(commitMessage);
            logger.info(`Changes committed to base branch`);
          } else {
            logger.info('No changes to commit');
          }

          // 11. Merge a develop - uno por cada servicio para mantener el control de directorios
          logger.info('Applying changes to develop branch...');
          let conflictsDetected = false;

          // Cambiar a develop primero
          await projectGit.git.checkout('develop');

          // Para cada servicio, sincronizar su directorio específico
          for (const service of servicesToProcess) {
            const serviceGit = new NxProjectGit(rootPath, service.dir);
            logger.info(`Syncing ${service.dir} to develop...`);

            const syncSuccess = await serviceGit.syncProjectDirectory();

            if (!syncSuccess) {
              conflictsDetected = true;
              logger.warn(`Conflictos detectados al sincronizar ${service.dir}`);
              break; // Si hay conflictos, detenemos el proceso
            }
          }

          // 12. Si hay conflictos, quedarse en develop para resolverlos
          if (conflictsDetected) {
            // Verificar explícitamente que estamos en develop
            const currentBranch = await projectGit.getCurrentBranch();
            if (currentBranch !== 'develop') {
              await projectGit.git.checkout('develop');
            }

            logger.info('You are now in develop branch. Please resolve merge conflicts before continuing.');
            return; // Terminar aquí para evitar cualquier intento de volver al branch original
          }

          // 13. Si todo fue bien (sin conflictos), volver al branch original
          if (originalBranch && originalBranch !== 'base' && originalBranch !== 'develop') {
            await projectGit.git.checkout(originalBranch);
            logger.info(`Returned to original branch: ${originalBranch}`);
          }

          logger.info(`✅ ${servicesToProcess.length} servicios generados exitosamente!`);
        } catch (callbackError) {
          logger.error(`Post-generation operations failed: ${callbackError instanceof Error ? callbackError.message : String(callbackError)}`);

          // En caso de error, intentamos quedarnos en develop
          try {
            await projectGit.git.checkout('develop');
            logger.info('Switched to develop branch to handle error');
          } catch (checkoutError) {
            // Si no podemos cambiarnos a develop, intentamos volver al branch original
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
