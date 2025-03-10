import { logger, Tree } from '@nx/devkit';
import { TranscribeGeneratorSchema } from '../transcribe/schema';
import { RunGeneratorSchema } from './schema';
import { userPrompt } from './userPrompts';
import * as path from 'path';
import { NxProjectGit } from '../utils/git-handler';
import * as fs from 'fs-extra';
import transcribe from '../transcribe/transcribe';

// Interfaces para estructuras de datos internas
interface ServiceInfo {
  name: string;
  type: string;
  dir: string;
  exists?: boolean;
  skip?: boolean;
  failed?: boolean;
}

interface GitContext {
  rootPath: string;
  projectGit: NxProjectGit;
  originalBranch: string;
}

/**
 * Función principal del generador
 */
export default async function (tree: Tree, options: RunGeneratorSchema) {
  try {
    // 1. Solicitar al usuario que seleccione servicios
    await userPrompt(options, tree);

    if (!options.selectedServices || options.selectedServices.length === 0) {
      logger.error('Debe seleccionar al menos un servicio para generar');
      return;
    }

    // 2. Inicializar contexto Git
    const gitContext = await initGitContext();

    // 3. Verificar estado de develop (seguridad)
    if (!await verifyDevelopSafety(gitContext)) {
      return; // Se cancela la operación si develop tiene cambios sin commitear
    }

    // 4. Verificar servicios y plantillas
    const servicesToProcess = verifyServicesAndTemplates(options.selectedServices, options);

    if (servicesToProcess.length === 0) {
      logger.error('No hay servicios válidos para procesar');
      return;
    }

    // 5. Generar Tree para todos los servicios
    const successfulServices = await generateTreeForServices(tree, servicesToProcess, options);

    if (successfulServices.length === 0) {
      logger.error('No se pudo generar ningún servicio');
      return;
    }

    // 6. Preparar branches y limpiar directorios
    const finalServices = await prepareGitBranches(gitContext, successfulServices);

    if (finalServices.length === 0) {
      logger.info('No hay servicios para procesar después de las verificaciones');
      await returnToOriginalBranch(gitContext);
      return;
    }

    // 7. NX escribirá los archivos al disco al finalizar
    logger.info(`Tree ready. NX will write ${finalServices.length} services to disk upon completion.`);

    // 8. Devolver callback para operaciones post-escritura
    return async () => {
      await postGenerationOperations(gitContext, finalServices);
    };
  } catch (error) {
    logger.error(`Project generation failed: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

/**
 * Inicializa el contexto Git
 */
async function initGitContext(): Promise<GitContext> {
  const rootPath = process.cwd();
  const projectGit = new NxProjectGit(rootPath, '');
  const originalBranch = await projectGit.getCurrentBranch();

  logger.info(`Starting Git operations (current branch: ${originalBranch})`);

  return { rootPath, projectGit, originalBranch };
}

/**
 * Verifica que develop no tenga cambios sin commitear
 */
async function verifyDevelopSafety(gitContext: GitContext): Promise<boolean> {
  const { projectGit, originalBranch } = gitContext;

  try {
    // Solo verificar si develop existe
    const branches = await projectGit.git.branch();
    if (!branches.all.includes('develop')) {
      return true; // Si develop no existe, no hay problema
    }

    // Verificar cambios en develop
    await projectGit.git.checkout('develop');
    const developStatus = await projectGit.git.status();

    // Volver al branch original
    await projectGit.git.checkout(originalBranch);

    if (developStatus.files.length > 0) {
      logger.warn(`
==========================================================================
⚠️ ADVERTENCIA: El branch develop tiene cambios sin commitear.

Para evitar perder estos cambios, por favor:
1. Haga commit de sus cambios con: git add . && git commit -m "Su mensaje"
2. O guárdelos temporalmente con: git stash save "Descripción"
3. Luego vuelva a ejecutar el generador

Operación cancelada para proteger sus cambios.
==========================================================================
      `);
      return false;
    }

    return true;
  } catch (error) {
    logger.warn(`Error al verificar estado de develop: ${error instanceof Error ? error.message : String(error)}`);
    await projectGit.git.checkout(originalBranch);
    return true; // Continuamos por precaución
  }
}

/**
 * Verifica servicios y sus plantillas
 */
function verifyServicesAndTemplates(selectedServices: string[], options: RunGeneratorSchema): ServiceInfo[] {
  const servicesToProcess: ServiceInfo[] = [];

  for (const serviceName of selectedServices) {
    const serviceType = options.services?.[serviceName];

    if (!serviceType) {
      logger.warn(`No se pudo determinar el tipo para el servicio ${serviceName}, se omitirá`);
      continue;
    }

    // Verificar plantillas
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
      logger.warn(`Error al verificar plantillas para ${serviceName}: ${error instanceof Error ? error.message : String(error)}. Se omitirá este servicio.`);
      continue;
    }

    const servicePrefix = serviceType === 'apollo-prisma' ? 'services' : 'apps';
    const serviceDir = `${servicePrefix}/${serviceName}`;

    servicesToProcess.push({
      name: serviceName,
      type: serviceType,
      dir: serviceDir
    });
  }

  return servicesToProcess;
}

/**
 * Genera el Tree para todos los servicios
 */
async function generateTreeForServices(
  tree: Tree,
  services: ServiceInfo[],
  options: RunGeneratorSchema
): Promise<ServiceInfo[]> {
  logger.info(`Generando ${services.length} servicios en el Tree...`);

  const result = [...services];

  for (const service of result) {
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
    } catch (error) {
      logger.error(`Error al procesar plantillas para ${service.name}: ${error instanceof Error ? error.message : String(error)}`);
      service.failed = true;
    }
  }

  return result.filter(s => !s.failed);
}

/**
 * Prepara branches y limpia directorios
 */
async function prepareGitBranches(
  gitContext: GitContext,
  services: ServiceInfo[]
): Promise<ServiceInfo[]> {
  const { projectGit, rootPath } = gitContext;

  try {
    // Asegurar que existen las ramas
    await projectGit.ensureBranches();

    // Cambiar a base
    await projectGit.git.checkout('base');
    logger.info('Switched to base branch');

    // Verificar cada servicio
    const result = [...services];

    for (const service of result) {
      const servicePath = path.join(rootPath, service.dir);
      const serviceExists = fs.existsSync(servicePath);
      service.exists = serviceExists;

      if (serviceExists) {
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

      // Limpiar directorio
      const serviceGit = new NxProjectGit(rootPath, service.dir);
      await serviceGit.cleanProjectDirectory();
    }

    return result.filter(s => !s.skip);
  } catch (error) {
    logger.error(`Failed to prepare Git branches: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

/**
 * Operaciones después de la generación
 */
async function postGenerationOperations(gitContext: GitContext, services: ServiceInfo[]): Promise<void> {
  const { projectGit, rootPath, originalBranch } = gitContext;

  try {
    logger.info('Post-generation operations starting...');

    // Commit en base
    const serviceDescriptions = services.map(s =>
      `${s.name} (${s.type})${s.exists ? ' (actualizado)' : ' (nuevo)'}`
    ).join(', ');

    const commitMessage = `Batch operation: Generated services - ${serviceDescriptions}`;

    // Verificar que estamos en base
    const currentBranch = await projectGit.getCurrentBranch();

    if (currentBranch !== 'base') {
      await projectGit.git.checkout('base');
    }

    // Add y commit
    for (const service of services) {
      await projectGit.git.add([service.dir]);
      logger.info(`Added ${service.dir} to commit`);
    }

    const status = await projectGit.git.status();

    if (status.files.length > 0) {
      await projectGit.git.commit(commitMessage);
      logger.info(`Changes committed to base branch`);
    } else {
      logger.info('No changes to commit');
    }

    // Merge a develop
    logger.info('Applying changes to develop branch...');
    let conflictsDetected = false;

    await projectGit.git.checkout('develop');

    for (const service of services) {
      const serviceGit = new NxProjectGit(rootPath, service.dir);
      logger.info(`Syncing ${service.dir} to develop...`);

      const syncSuccess = await serviceGit.syncProjectDirectory();

      if (!syncSuccess) {
        conflictsDetected = true;
        logger.warn(`Conflictos detectados al sincronizar ${service.dir}`);
        break;
      }
    }

    // Manejo final
    if (conflictsDetected) {
      // Asegurarse de estar en develop para resolver conflictos
      if (await projectGit.getCurrentBranch() !== 'develop') {
        await projectGit.git.checkout('develop');
      }

      logger.info('You are now in develop branch. Please resolve merge conflicts before continuing.');
    } else {
      // Volver al branch original si no hubo conflictos
      await returnToOriginalBranch(gitContext);
      logger.info(`✅ ${services.length} servicios generados exitosamente!`);
    }
  } catch (error) {
    logger.error(`Post-generation operations failed: ${error instanceof Error ? error.message : String(error)}`);

    try {
      // Intentar volver a develop en caso de error
      await projectGit.git.checkout('develop');
      logger.info('Switched to develop branch to handle error');
    } catch (checkoutError) {
      // Si no podemos ir a develop, intentar volver al branch original
      await returnToOriginalBranch(gitContext);
    }
  }
}

/**
 * Volver al branch original si es adecuado
 */
async function returnToOriginalBranch(gitContext: GitContext): Promise<void> {
  const { projectGit, originalBranch } = gitContext;

  if (originalBranch && originalBranch !== 'base' && originalBranch !== 'develop') {
    try {
      await projectGit.git.checkout(originalBranch);
      logger.info(`Returned to original branch: ${originalBranch}`);
    } catch (error) {
      logger.error(`Failed to return to original branch: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
