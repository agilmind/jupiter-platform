import {
  Tree,
  formatFiles,
  logger,
} from '@nx/devkit';
import { WorkerRemoverSchema } from './schema';
import { execSync } from 'child_process';

function removeFromNginxDependsOn(dockerComposeContent, workerName) {
  logger.debug('Iniciando removeFromNginxDependsOn');
  logger.debug(`Buscando dependencia '${workerName}' en nginx`);

  // Buscar la sección nginx
  const nginxRegex = /  nginx:[\s\S]*?depends_on:[\s\S]*?((?:      - .*\n)+)(?:    \w|  \w|\}|$)/m;
  const nginxMatch = dockerComposeContent.match(nginxRegex);

  if (nginxMatch) {
    logger.debug('Sección nginx encontrada en el documento');

    // Capturamos las dependencias actuales
    const currentDependencies = nginxMatch[1];
    logger.debug('Dependencias actuales encontradas:', currentDependencies);

    // Crear una expresión regular para encontrar la línea específica del worker
    const workerLineRegex = new RegExp(`      - ${workerName}\\s*\\n`, 'g');

    // Comprobar si el worker está en las dependencias
    const workerExists = workerLineRegex.test(currentDependencies);
    logger.debug(`¿El worker '${workerName}' está en las dependencias? ${workerExists}`);

    if (!workerExists) {
      logger.debug('Worker no encontrado en las dependencias');
      return dockerComposeContent;
    }

    // Reset de la regex y eliminar la línea del worker
    const newDependencies = currentDependencies.replace(new RegExp(`      - ${workerName}\\s*\\n`, 'g'), '');
    logger.debug('Nuevas dependencias después de eliminar el worker:', newDependencies);

    // Reemplazar las dependencias antiguas con las nuevas
    const updatedContent = dockerComposeContent.replace(currentDependencies, newDependencies);
    logger.debug('Dependencias de nginx actualizadas correctamente');
    return updatedContent;
  } else {
    logger.debug('No se encontró la sección nginx o depends_on en el documento');
  }

  return dockerComposeContent;
}

function removeFromDockerCompose(tree: Tree, workerName: string) {
  const dockerComposePath = 'docker-compose.yml';

  if (!tree.exists(dockerComposePath)) {
    logger.warn(`No se encontró ${dockerComposePath}.`);
    return;
  }

  logger.debug(`==== INICIANDO ELIMINACIÓN DE ${workerName} ====`);

  // Leer el archivo como texto completo
  let dockerComposeContent = tree.read(dockerComposePath).toString();

  // Primero eliminar del depends_on de nginx
  dockerComposeContent = removeFromNginxDependsOn(dockerComposeContent, workerName);

  // Esta regex encuentra tanto el comentario opcional que puede preceder al servicio como
  // el nombre del servicio y todos sus atributos indentados, hasta el siguiente servicio o final del archivo
  const servicePattern =
    // Captura un posible comentario que precede al servicio
    `(\\s*#[^\\n]*${workerName}[^\\n]*\\n)?` +
    // Captura la línea del nombre del servicio
    `(\\s+${workerName}:\\s*\\n)` +
    // Captura todas las líneas indentadas que pertenecen a este servicio (4 o más espacios)
    `((?:\\s{4,}[^\\n]*\\n)*)`;

  const serviceRegex = new RegExp(servicePattern, 'g');

  // Realizar el reemplazo
  const updatedContent = dockerComposeContent.replace(serviceRegex, '');

  if (updatedContent !== dockerComposeContent) {
    // Eliminar líneas vacías extra
    const finalContent = updatedContent.replace(/\n{3,}/g, '\n\n');

    tree.write(dockerComposePath, finalContent);
    logger.info(`Se ha eliminado la configuración de ${workerName} de ${dockerComposePath}`);
  } else {
    // Si no funcionó el patrón anterior, intentamos con otro enfoque
    // Buscar desde la línea del servicio hasta el próximo servicio
    const simplifiedPattern = `\\s+${workerName}:\\s*\\n(?:[\\s\\S]*?)(?=\\s+\\w+:|$)`;
    const simplifiedRegex = new RegExp(simplifiedPattern, 'g');

    const simplifiedContent = dockerComposeContent.replace(simplifiedRegex, '');

    if (simplifiedContent !== dockerComposeContent) {
      const finalContent = simplifiedContent.replace(/\n{3,}/g, '\n\n');
      tree.write(dockerComposePath, finalContent);
      logger.info(`Se ha eliminado la configuración de ${workerName} (enfoque alternativo).`);
    } else {
      logger.warn(`No se pudo eliminar la configuración para ${workerName} en ${dockerComposePath}`);
    }
  }
}

export async function workerRemoverGenerator(
  tree: Tree,
  options: WorkerRemoverSchema
) {
  const workerName = options.name;
  logger.info(`Iniciando eliminación del worker '${workerName}'`);

  // Eliminar del docker-compose.yml
  removeFromDockerCompose(tree, workerName);

  // Luego invocar el generador remove de NX
  try {
    logger.info(`Ejecutando comando de NX para eliminar proyecto: nx g @nx/workspace:remove ${workerName} --forceRemove`);
    execSync(`nx g @nx/workspace:remove ${workerName} --forceRemove`, { stdio: 'inherit' });
    logger.info(`El worker ${workerName} ha sido eliminado completamente.`);
  } catch (error) {
    logger.error(`Error al eliminar el proyecto ${workerName}: ${error.message}`);
  }

  await formatFiles(tree);
}

export default workerRemoverGenerator;
