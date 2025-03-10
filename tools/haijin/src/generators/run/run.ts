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
    // Inicializar Git handler sin directorio específico
    const projectGit = new NxProjectGit(rootPath, '');
    const originalBranch = await projectGit.getCurrentBranch();
    logger.info(`Starting Git operations (current branch: ${originalBranch})`);

    // 3. IMPORTANTE: Verificar y procesar todos los servicios ANTES de cambiar de branch
    const servicesToProcess = [];

    for (const serviceName of selectedServices) {
      const serviceType = options.services?.[serviceName];
      if (!serviceType) {
        logger.warn(`No se pudo determinar el tipo para el servicio ${serviceName}, se omitirá`);
        continue;
      }

      // Verificar plantillas mientras estamos en el branch original
      const templatePath = path.join(__dirname, '..', 'transcribe', 'files', serviceType);

      try {
        const stats = fs.statSync(templatePath);
        if (!stats.isDirectory()) {
          logger.warn(`Error: ${templatePath} existe pero no es un directorio. Se omitirá el servicio ${serviceName}.`);
          continue;
        }

        const templateFiles = fs.readdirSync(templatePath);
        if (templateFiles.length === 0) {
          logger.warn(`El directorio de plantillas ${templatePath} está vacío. Se omitirá el servicio ${serviceName}.`);
          continue;
        }

        logger.info(`Plantillas verificadas para ${serviceName}: ${templateFiles.length} archivos disponibles`);
      } catch (error) {
        logger.warn(`Error al verificar plantillas para ${serviceName}: ${error.message}. Se omitirá este servicio.`);
        continue;
      }

      const servicePrefix = serviceType === 'apollo-prisma' ? 'services' : 'apps';
      const serviceDir = `${servicePrefix}/${serviceName}`;

      // Agregar a la lista de servicios a procesar
      servicesToProcess.push({
        name: serviceName,
        type: serviceType,
        dir: serviceDir
      });
    }

    if (servicesToProcess.length === 0) {
      logger.error('No hay servicios válidos para procesar. Se requieren plantillas para los tipos de servicios seleccionados.');
      return;
    }

    // 4. Generar todos los servicios en el Tree mientras estamos en el branch original
    logger.info(`Generando ${servicesToProcess.length} servicios en el Tree...`);

    for (const service of servicesToProcess) {
      try {
        const serviceOptions = {
          ...options,
          currentService: service.name,
          currentServiceType: service.type
        };

        const transcribeOptions: TranscribeGeneratorSchema = {
          name: options.name,
          runOptions: serviceOptions
        };

        logger.info(`Processing templates for service: ${service.name}`);
        await transcribe(tree, transcribeOptions);
      } catch (templateError) {
        logger.error(`Error al procesar plantillas para ${service.name}: ${templateError.message}`);
        service.failed = true;
      }
    }

    // Filtrar servicios que fallaron
    const successfulServices = servicesToProcess.filter(s => !s.failed);

    if (successfulServices.length === 0) {
      logger.error('Todos los servicios fallaron durante el procesamiento de plantillas');
      throw new Error('No se pudo generar ningún servicio');
    }

    // 5. Preparar operaciones de Git
    try {
      // Asegurarse de que existen las ramas necesarias
      await projectGit.ensureBranches();

      // 6. AHORA cambiamos al branch base para la escritura al disco
      await projectGit.git.checkout('base');
      logger.info('Switched to base branch');

      // 7. Verificar y limpiar directorios de servicios en base
      for (const service of successfulServices) {
        // Verificar si el servicio ya existe
        const servicePath = path.join(rootPath, service.dir);
        const serviceExists = fs.existsSync(servicePath);
        service.exists = serviceExists;

        if (serviceExists) {
          // Preguntar si quiere actualizar este servicio existente
          const readline = require('readline').createInterface({
            input: process.stdin,
            output: process.stdout
          });

          const answer = await new Promise<string>(resolve => {
            readline.question(`El servicio ${service.name} ya existe. ¿Desea actualizarlo? (y/N): `, resolve);
          });

          readline.close();

          if (answer.toLowerCase() !== 'y') {
            logger.info(`Omitiendo actualización de ${service.name}`);
            service.skip = true;
            continue;
          }

          logger.info(`Actualizando servicio: ${service.name}`);
        } else {
          logger.info(`Creando nuevo servicio: ${service.name}`);
        }

        // Limpiar directorio para este servicio en base
        const serviceGit = new NxProjectGit(rootPath, service.dir);
        await serviceGit.cleanProjectDirectory();
      }

      // Filtrar servicios a omitir
      const finalServices = successfulServices.filter(s => !s.skip);

      if (finalServices.length === 0) {
        logger.info('No hay servicios para procesar después de las verificaciones. Finalizando.');

        // Volver al branch original
        await projectGit.git.checkout(originalBranch);
        return;
      }

      // 8. NX escribirá automáticamente al disco cuando finalice el generador
      logger.info(`Tree ready. NX will write ${finalServices.length} services to disk upon completion.`);

      // 9. Devolver la función de callback para operaciones post-escritura
      return async () => {
        try {
          logger.info('Post-generation operations starting...');

          // 10. Git add y commit en branch base
          const serviceDescriptions = finalServices.map(s =>
            `${s.name} (${s.type})${s.exists ? ' (actualizado)' : ' (nuevo)'}`
          ).join(', ');

          const commitMessage = `Batch operation: Generated services - ${serviceDescriptions}`;

          // Verificar que estamos en base
          const currentBranch = await projectGit.getCurrentBranch();
          if (currentBranch !== 'base') {
            await projectGit.git.checkout('base');
          }

          // Añadir todos los directorios afectados
          for (const service of finalServices) {
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

          // 11. Merge a develop
          logger.info('Applying changes to develop branch...');
          let conflictsDetected = false;

          // Cambiar a develop primero
          await projectGit.git.checkout('develop');

          // Para cada servicio, sincronizar su directorio específico
          for (const service of finalServices) {
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
            const currentBranch = await projectGit.getCurrentBranch();
            if (currentBranch !== 'develop') {
              await projectGit.git.checkout('develop');
            }

            logger.info('You are now in develop branch. Please resolve merge conflicts before continuing.');
            return;
          }

          // 13. Volver al branch original
          if (originalBranch && originalBranch !== 'base' && originalBranch !== 'develop') {
            await projectGit.git.checkout(originalBranch);
            logger.info(`Returned to original branch: ${originalBranch}`);
          }

          logger.info(`✅ ${finalServices.length} servicios generados exitosamente!`);
        } catch (callbackError) {
          logger.error(`Post-generation operations failed: ${callbackError instanceof Error ? callbackError.message : String(callbackError)}`);

          try {
            await projectGit.git.checkout('develop');
            logger.info('Switched to develop branch to handle error');
          } catch (checkoutError) {
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
      logger.error(`Git operations failed: ${gitError instanceof Error ? gitError.message : String(gitError)}`);

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
