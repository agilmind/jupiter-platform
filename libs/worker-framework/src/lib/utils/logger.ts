import { createLogger as createWinstonLogger, format, transports, Logger } from 'winston';

/**
 * Crea un logger configurado
 * @param service Nombre del servicio para los metadatos
 * @param options Opciones adicionales
 * @returns Instancia de logger
 */
export function createLogger(service: string, options: {
  level?: string;
  colorize?: boolean;
  json?: boolean;
} = {}): Logger {
  const level = options.level || process.env['LOG_LEVEL'] || 'info';
  const colorize = options.colorize ?? (process.env['NODE_ENV'] !== 'production');
  const json = options.json ?? (process.env['NODE_ENV'] === 'production');

  // Formatters
  const formatters = [
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    format.errors({ stack: true }),
    format.splat(),
    format.metadata({ fillExcept: ['message', 'level', 'timestamp', 'service'] })
  ];

  if (json) {
    formatters.push(format.json());
  } else {
    formatters.push(
      format.printf((info) => {
        const { timestamp, level, message, service, metadata, stack } = info;
        // Tratamos metadata como Record<string, any> para evitar problemas de tipo
        const meta = metadata as Record<string, any>;
        const metaStr = meta && typeof meta === 'object' && Object.keys(meta).length 
          ? `\n${JSON.stringify(meta, null, 2)}` 
          : '';
        const stackStr = stack ? `\n${stack}` : '';
        return `${timestamp} [${service}] ${level.toUpperCase()}: ${message}${metaStr}${stackStr}`;
      })
    );
  }

  if (colorize) {
    formatters.push(format.colorize());
  }

  return createWinstonLogger({
    level,
    defaultMeta: { service },
    format: format.combine(...formatters),
    transports: [
      new transports.Console()
    ]
  });
}
