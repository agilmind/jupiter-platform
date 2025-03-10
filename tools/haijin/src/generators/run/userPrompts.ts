import { RunGeneratorSchema } from './schema';
import { readJson, Tree, logger } from '@nx/devkit';
import * as enquirer from 'enquirer';

export async function userPrompt(options: RunGeneratorSchema, tree: Tree) {
  if (!options.name) {
    throw new Error('Se debe proporcionar un nombre de proyecto');
  }

  const configPath = `haikus/${options.name}/hkconfig.json`;

  if (!tree.exists(configPath)) {
    throw new Error(`Archivo de configuración no encontrado: ${configPath}`);
  }

  try {
    // Leer la configuración y asignarla a options
    const config = readJson(tree, configPath);
    Object.assign(options, config);

    const serviceKeys = Object.keys(options.services || {});

    if (serviceKeys.length === 0) {
      throw new Error('No hay servicios definidos en la configuración');
    }

    // Preparar opciones para checkbox, marcando el servicio por defecto
    const defaultService = options.defaultService || serviceKeys[0];
    const choices = serviceKeys.map(service => ({
      name: service,
      message: service,
      value: service,
      selected: service === defaultService
    }));

    // Usar el prompt de tipo checkbox para selección múltiple
    const response = await enquirer.prompt<{ selectedServices: string[] }>({
      type: 'multiselect',
      name: 'selectedServices',
      message: '¿Qué servicios desea agregar? (Use las flechas para moverse, espacio para seleccionar y enter para confirmar)',
      choices: choices
    });

    // Guardar los servicios seleccionados
    options.selectedServices = response.selectedServices;

    if (!options.selectedServices || options.selectedServices.length === 0) {
      throw new Error('Debe seleccionar al menos un servicio');
    }

    logger.info(`Servicios seleccionados: ${options.selectedServices.join(', ')}`);

    // Por compatibilidad, si solo se seleccionó uno, también lo asignamos al formato antiguo
    if (options.selectedServices.length === 1) {
      options.currentService = options.selectedServices[0];
      options.currentServiceType = options.services?.[options.currentService];
      logger.info(`Servicio único seleccionado: ${options.currentService}, Tipo: ${options.currentServiceType}`);
    }
  } catch (error) {
    throw new Error(`Error al procesar la configuración: ${error.message}`);
  }
}
