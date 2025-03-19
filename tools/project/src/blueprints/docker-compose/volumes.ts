import { GeneratorOptions } from '../types';

export function volumes(options: GeneratorOptions): string {
  let result = 'volumes:\n';

  // Agregar volúmenes según los servicios incluidos
  if (options.includeApolloPrisma) {
    result += '  postgres_data:\n';
  }

  if (options.includeRabbitMQ) {
    result += '  rabbitmq_data:\n';
  }

  return result;
}
