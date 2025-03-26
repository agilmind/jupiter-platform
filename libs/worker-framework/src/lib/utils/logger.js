"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLogger = void 0;
const winston_1 = require("winston");
/**
 * Crea un logger configurado
 * @param service Nombre del servicio para los metadatos
 * @param options Opciones adicionales
 * @returns Instancia de logger
 */
function createLogger(service, options = {}) {
    const level = options.level || process.env['LOG_LEVEL'] || 'info';
    const colorize = options.colorize ?? (process.env['NODE_ENV'] !== 'production');
    const json = options.json ?? (process.env['NODE_ENV'] === 'production');
    // Formatters
    const formatters = [
        winston_1.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
        winston_1.format.errors({ stack: true }),
        winston_1.format.splat(),
        winston_1.format.metadata({ fillExcept: ['message', 'level', 'timestamp', 'service'] })
    ];
    if (json) {
        formatters.push(winston_1.format.json());
    }
    else {
        formatters.push(winston_1.format.printf((info) => {
            const { timestamp, level, message, service, metadata, stack } = info;
            // Tratamos metadata como Record<string, any> para evitar problemas de tipo
            const meta = metadata;
            const metaStr = meta && typeof meta === 'object' && Object.keys(meta).length
                ? `\n${JSON.stringify(meta, null, 2)}`
                : '';
            const stackStr = stack ? `\n${stack}` : '';
            return `${timestamp} [${service}] ${level.toUpperCase()}: ${message}${metaStr}${stackStr}`;
        }));
    }
    if (colorize) {
        formatters.push(winston_1.format.colorize());
    }
    return (0, winston_1.createLogger)({
        level,
        defaultMeta: { service },
        format: winston_1.format.combine(...formatters),
        transports: [
            new winston_1.transports.Console()
        ]
    });
}
exports.createLogger = createLogger;
