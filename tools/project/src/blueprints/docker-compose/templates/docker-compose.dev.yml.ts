import { GeneratorOptions } from '../../types';
import { appServerService } from '../services/app-server';
import { webAppService } from '../services/web-app';
import { postgresService } from '../services/postgres';
import { pgbouncerService } from '../services/pgbouncer';
import { rabbitmqService } from '../services/rabbitmq';
import { networks } from '../networks';
import { volumes } from '../volumes';

export function dockerComposeDev(options: GeneratorOptions): string {
  let content = `services:\n`;

  // Agregar servicios según las opciones
  if (options.includeApolloPrisma) {
    content += `${appServerService(options)}\n\n`;
    content += `${postgresService(options)}\n\n`;

    if (options.includePgBouncer) {
      content += `${pgbouncerService(options)}\n\n`;
    }
  }

  if (options.includeWebApp) {
    content += `${webAppService(options)}\n\n`;
  }

  if (options.includeRabbitMQ) {
    content += `${rabbitmqService(options)}\n\n`;
  }

  // Agregar redes
  content += `${networks(options)}\n\n`;

  // Agregar volúmenes
  content += `${volumes(options)}`;

  return content;
}
