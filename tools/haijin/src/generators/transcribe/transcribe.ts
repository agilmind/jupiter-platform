import { Tree, formatFiles, generateFiles, logger } from '@nx/devkit';
import * as path from 'path';
import * as enquirer from 'enquirer';
import { TranscribeGeneratorSchema } from './schema';

export default async function (tree: Tree, options: TranscribeGeneratorSchema) {
  if (!options.runOptions) {
      throw new Error(`Este generador se ejecuta únicamente invocado por el generador haijin:run`);
  }
  try {
    logger.info(`Iniciando generador Tree para el proyecto: ${options.name}`);

    // Leer el archivo de configuración como en tu ejemplo anterior
    const configPath = `haikus/${options.name}/hkconfig.json`;

    if (!tree.exists(configPath)) {
      throw new Error(`Archivo de configuración no encontrado: ${configPath}`);
    }

    // Leer y parsear el archivo de configuración
    const configContent = tree.read(configPath, 'utf8');
    const config = JSON.parse(configContent);

    // Combinar las opciones con la configuración
    const fullOptions = { ...config, ...options };

    // Si no estamos en modo de solo memoria (dryRun), solicitar al usuario que seleccione un servicio
    if (!options.dryRun) {
      // Obtener las claves de servicios
      const serviceKeys = Object.keys(fullOptions.services || {});

      if (serviceKeys.length === 0) {
        throw new Error('No hay servicios definidos en la configuración');
      }

      // Solicitar al usuario que seleccione un servicio
      const response = await enquirer.prompt<{ currentService: string }>({
        type: 'select',
        name: 'currentService',
        message: '¿Qué servicio desea agregar?',
        choices: serviceKeys,
        initial: serviceKeys.indexOf(fullOptions.defaultService || serviceKeys[0])
      });

      // Asignar el servicio seleccionado a las opciones
      fullOptions.currentService = response.currentService;
      fullOptions.currentServiceType = fullOptions.services[fullOptions.currentService];

      logger.info(`Servicio seleccionado: ${fullOptions.currentService}, Tipo: ${fullOptions.currentServiceType}`);
    } else {
      // En modo dryRun, seleccionamos automáticamente el servicio predeterminado
      fullOptions.currentService = fullOptions.defaultService || Object.keys(fullOptions.services)[0];
      fullOptions.currentServiceType = fullOptions.services[fullOptions.currentService];
      logger.info(`Modo dryRun: seleccionando servicio predeterminado - ${fullOptions.currentService}`);
    }

    // Generar archivos basados en plantillas
    const templatePath = path.join(__dirname, 'files', fullOptions.currentServiceType);

    generateFiles(
      tree,
      templatePath,
      path.join('projects', fullOptions.name, fullOptions.currentService),
      fullOptions
    );

    await formatFiles(tree);

    logger.info('Generador Tree completado');

    return () => {
      logger.info(`Generación de archivos para ${fullOptions.name}/${fullOptions.currentService} completada`);
    };
  } catch (error) {
    logger.error(`Error en el generador Tree: ${error.message}`);
    throw error;
  }
}
