import { ProjectGeneratorSchema } from './schema';
import { readJson, Tree } from '@nx/devkit';
import * as enquirer from 'enquirer';

export async function userPrompt(options: ProjectGeneratorSchema, tree: Tree) {
  if (!options.name) {
    throw new Error('Se debe proporcionar un nombre de proyecto');
  }

  const configPath = `haikus/${options.name}/hkconfig.json`;

  if (!tree.exists(configPath)) {
    throw new Error(`Archivo de configuración no encontrado: ${configPath}`);
  }

  try {
    const config = readJson(tree, configPath);

    Object.assign(options, config);

    const serviceKeys = Object.keys(options.services || {});

    if (serviceKeys.length === 0) {
      throw new Error('No hay servicios definidos en la configuración');
    }

    const response = await enquirer.prompt<{ currentService: string }>({
      type: 'select',
      name: 'currentService',
      message: '¿Qué servicio desea agregar?',
      choices: serviceKeys,
      initial: serviceKeys.indexOf(options.defaultService || serviceKeys[0])
    });

    options.currentService = response.currentService;

    if (options.currentService && options.services) {
      options.currentServiceType = options.services[options.currentService];
      console.log(`Servicio seleccionado: ${options.currentService}, Tipo: ${options.currentServiceType}`);
    } else {
      console.error('No se pudo determinar el tipo de servicio');
    }

    console.log('Opciones finales:', options);
  } catch (error) {
    throw new Error(`Error al procesar la configuración: ${error.message}`);
  }
}
