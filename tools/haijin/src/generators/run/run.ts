import { logger, Tree } from '@nx/devkit';
import { TranscribeGeneratorSchema } from '../transcribe/schema';
import { RunGeneratorSchema } from './schema';
import { userPrompt } from './userPrompts';
import * as path from 'path';
import * as fs from 'fs-extra';
import { SimpleGit, simpleGit } from 'simple-git';
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
  git: SimpleGit;
  rootPath: string;
  originalBranch: string;
  tempBranch: string;
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

    // 4. Verificar rerere está habilitado
    const rerereEnabled = await verifyRerereEnabled(gitContext);
    if (!rerereEnabled) {
      logger.error('El generador requiere Git rerere habilitado para continuar');
      return; // Detener ejecución si rerere no está habilitado
    }

    // 5. Verificar servicios y plantillas
    const servicesToProcess = verifyServicesAndTemplates(options.selectedServices, options);

    if (servicesToProcess.length === 0) {
      logger.error('No hay servicios válidos para procesar');
      await returnToOriginalBranch(gitContext);
      return;
    }

    // 6. Crear y cambiar a branch temporal
    await createAndCheckoutTempBranch(gitContext);

    // 7. Verificar cada servicio y preguntar por actualización
    const servicesToGenerate = await confirmServiceUpdates(servicesToProcess);

    if (servicesToGenerate.length === 0) {
      logger.info('No hay servicios seleccionados para actualizar');
      await returnToOriginalBranch(gitContext);
      return;
    }

    // 8. Generar Tree para los servicios seleccionados
    const successfulServices = await generateTreeForServices(tree, servicesToGenerate, options);

    if (successfulServices.length === 0) {
      logger.error('No se pudo generar ningún servicio');
      await returnToOriginalBranch(gitContext);
      return;
    }

    // 9. NX escribirá los archivos al disco al finalizar
    logger.info(`Tree ready. NX will write ${successfulServices.length} services to disk upon completion.`);

    // 10. Devolver callback para operaciones post-escritura
    return async () => {
      await postGenerationOperations(gitContext, successfulServices);
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
  const git = simpleGit(rootPath);
  const originalBranch = await git.revparse(['--abbrev-ref', 'HEAD']);
  const timestamp = Date.now().toString(36);
  const tempBranch = `temp-gen-${timestamp}`;

  logger.info(`Starting Git operations (current branch: ${originalBranch})`);

  return { git, rootPath, originalBranch, tempBranch };
}

/**
 * Verifica que develop no tenga cambios sin commitear
 */
async function verifyDevelopSafety(gitContext: GitContext): Promise<boolean> {
  const { git, originalBranch } = gitContext;

  try {
    // Solo verificar si develop existe
    const branches = await git.branch();
    if (!branches.all.includes('develop')) {
      logger.info('Branch develop no existe, se creará durante el proceso');
      return true;
    }

    // Verificar cambios en develop
    await git.checkout('develop');
    const developStatus = await git.status();

    // Volver al branch original
    await git.checkout(originalBranch);

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
    await git.checkout(originalBranch);
    return true; // Continuamos por precaución
  }
}

/**
 * Verifica que rerere esté habilitado
 * @returns true si rerere está habilitado, false si no
 */
async function verifyRerereEnabled(gitContext: GitContext): Promise<boolean> {
  const { git } = gitContext;

  try {
    const rerereEnabled = await git.raw(['config', '--get', 'rerere.enabled']).catch(() => '');

    if (!rerereEnabled.trim() || rerereEnabled.trim() !== 'true') {
      logger.error(`
==========================================================================
ERROR: Git rerere no está habilitado.

Git rerere es REQUERIDO para el funcionamiento correcto del generador.
Permite recordar resoluciones de conflictos previas para aplicarlas
automáticamente cuando se encuentren conflictos similares.

Para habilitarlo, ejecute:
  git config --global rerere.enabled true

Luego vuelva a ejecutar el generador.
==========================================================================
      `);
      return false;
    } else {
      logger.info('Git rerere está habilitado ✅ - Las resoluciones de conflictos serán recordadas');
      return true;
    }
  } catch (error) {
    logger.error(`No se pudo verificar el estado de Git rerere: ${error instanceof Error ? error.message : String(error)}`);
    return false;
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
 * Crea y cambia a branch temporal
 */
async function createAndCheckoutTempBranch(gitContext: GitContext): Promise<void> {
  const { git, tempBranch, originalBranch } = gitContext;

  try {
    // Crear y cambiar a branch temporal
    await git.checkout(['-b', tempBranch]);
    logger.info(`Created and switched to temporary branch: ${tempBranch}`);

    // Asegurar que develop existe
    const branches = await git.branch();
    if (!branches.all.includes('develop')) {
      // Si estamos en main o master, usamos eso como base para develop
      const baseBranch = branches.all.includes('main') ? 'main' :
                        branches.all.includes('master') ? 'master' : originalBranch;

      // Crear develop desde el branch base
      await git.checkout(['-b', 'develop', baseBranch]);
      logger.info(`Created develop branch from ${baseBranch}`);

      // Volver al branch temporal
      await git.checkout(tempBranch);
    }
  } catch (error) {
    logger.error(`Failed to create temporary branch: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

/**
 * Confirma actualizaciones de servicios existentes
 */
async function confirmServiceUpdates(services: ServiceInfo[]): Promise<ServiceInfo[]> {
  const result = [...services];

  for (const service of result) {
    // Verificar si el servicio ya existe
    const servicePath = path.join(process.cwd(), service.dir);
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
  }

  return result.filter(s => !s.skip);
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
 * Operaciones después de la generación
 */
async function postGenerationOperations(gitContext: GitContext, services: ServiceInfo[]): Promise<void> {
  const { git, tempBranch, originalBranch } = gitContext;

  try {
    logger.info('Post-generation operations starting...');

    // Crear descripción de servicios
    const serviceDescriptions = services.map(s =>
      `${s.name} (${s.type})${s.exists ? ' (actualizado)' : ' (nuevo)'}`
    ).join(', ');

    // Mensaje de commit
    const commitMessage = `Generated services: ${serviceDescriptions}`;

    // Añadir todos los cambios
    for (const service of services) {
      await git.add([service.dir]);
      logger.info(`Added ${service.dir} to commit`);
    }

    // Verificar si hay cambios para commitear
    const status = await git.status();

    if (status.files.length === 0) {
      logger.info('No changes detected, nothing to commit');
      await returnToOriginalBranch(gitContext);
      return;
    }

    // Commit en branch temporal
    await git.commit(commitMessage);
    logger.info(`Changes committed to temporary branch: ${tempBranch}`);

    // Cambiar a develop para merge
    await git.checkout('develop');
    logger.info('Switched to develop branch');

    try {
      // Intentar merge
      await git.merge([tempBranch, '--no-ff', '-m', `Merge ${tempBranch}: ${commitMessage}`]);
      logger.info('Changes merged successfully to develop');
    } catch (error) {
      // Verificar si rerere resolvió los conflictos
      const mergeStatus = await git.status();
      const hasUnresolvedConflicts = mergeStatus.conflicted.length > 0;

      if (!hasUnresolvedConflicts && mergeStatus.files.length > 0) {
        // Todos los conflictos fueron resueltos automáticamente por rerere
        logger.info('Conflicts automatically resolved by Git rerere');

        // Añadir archivos resueltos y completar el merge
        await git.add('.');
        await git.commit('Auto-merge with rerere-resolved conflicts');
        logger.info('Automatic merge completed successfully');

        // Volver al branch original
        await returnToOriginalBranch(gitContext);
      } else {
        // Hay conflictos no resueltos automáticamente
        logger.warn(`
==========================================================================
CONFLICTOS DETECTADOS

Se han detectado conflictos al fusionar los cambios en develop.
Se requiere resolución manual para los siguientes servicios:
${mergeStatus.conflicted.join('\n')}

Para resolver y ASEGURAR que Git rerere aprenda:
1. Revise los archivos conflictivos con: git status
2. Resuelva los conflictos en su editor
3. Añada los archivos resueltos: git add .
4. Ejecute: git rerere
5. Verifique que rerere aprendió: git rerere diff
6. Complete el merge con: git commit -m "Resolved conflicts"
7. Elimine el branch temporal: git branch -D ${tempBranch}
8. Vuelva al branch original: git checkout ${originalBranch}

IMPORTANTE: Los pasos 4 y 5 son cruciales para que Git rerere aprenda
la resolución y no vuelva a preguntar por el mismo conflicto.

Nota: Si continúa viendo los mismos conflictos repetidamente, puede ser
que el contenido exacto de los archivos esté cambiando ligeramente en cada
generación, lo que hace que Git los considere como conflictos diferentes.
==========================================================================
        `);

        // No continuamos, el usuario debe resolver manualmente
        return;
      }
    }

    // Si llegamos aquí, el merge fue exitoso
    // Eliminar branch temporal
    await git.branch(['-D', tempBranch]);
    logger.info(`Temporary branch ${tempBranch} deleted`);

    // Volver al branch original después del merge exitoso
    await returnToOriginalBranch(gitContext);

    logger.info(`✅ ${services.length} servicios generados exitosamente!`);

  } catch (error) {
    logger.error(`Post-generation operations failed: ${error instanceof Error ? error.message : String(error)}`);

    // Intentar volver al branch original en caso de error
    await returnToOriginalBranch(gitContext);
  }
}

/**
 * Volver al branch original
 */
async function returnToOriginalBranch(gitContext: GitContext): Promise<void> {
  const { git, originalBranch, tempBranch } = gitContext;

  try {
    const currentBranch = await git.revparse(['--abbrev-ref', 'HEAD']);

    // Si estamos en el branch temporal, intentamos eliminarlo
    if (currentBranch === tempBranch) {
      await git.checkout(originalBranch);

      try {
        await git.branch(['-D', tempBranch]);
        logger.info(`Temporary branch ${tempBranch} deleted`);
      } catch (deleteError) {
        logger.warn(`Could not delete temporary branch: ${deleteError.message}`);
      }
    } else if (currentBranch !== originalBranch) {
      // Si estamos en cualquier otro branch que no sea el original, volvemos al original
      await git.checkout(originalBranch);
    }

    logger.info(`Returned to original branch: ${originalBranch}`);
  } catch (error) {
    logger.error(`Failed to return to original branch: ${error instanceof Error ? error.message : String(error)}`);
  }
}
