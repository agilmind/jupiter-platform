"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TextScraperHandler = void 0;
const scraper_interfaces_1 = require("./scraper-interfaces");
const amqp = __importStar(require("amqplib"));
/**
 * Clase handler para procesar tareas de scraping de texto
 * Utiliza composición para trabajar con diferentes tipos de scrapers
 */
class TextScraperHandler {
    constructor(scrapers, config, logger) {
        this.scrapers = [];
        this.customChannel = null;
        this.scrapers = scrapers;
        this.config = config;
        this.logger = logger;
        // Obtener nombre de la cola de resultados de la configuración
        this.resultQueue = config.queue.resultQueue || 'result_queue';
    }
    /**
     * Inicializa recursos adicionales (p. ej. cola de resultados)
     */
    async initialize() {
        this.logger.info('Inicializando TextScraperHandler');
        try {
            // Inicializar canal de resultado separado si está configurado
            if (this.resultQueue) {
                this.logger.info(`Configurando canal para cola de resultados: ${this.resultQueue}`);
                try {
                    const connection = await amqp.connect(this.config.queue.connectionUrl);
                    this.customChannel = await connection.createChannel();
                    await this.customChannel.assertQueue(this.resultQueue, { durable: true });
                    this.logger.info(`Canal de resultados configurado para cola: ${this.resultQueue}`);
                }
                catch (error) {
                    this.logger.error('Error configurando canal de resultados:', {
                        error: error instanceof Error ? error.message : String(error)
                    });
                    // No lanzamos error para permitir continuar sin este canal (modo degradado)
                }
            }
        }
        catch (error) {
            this.logger.error('Error en inicialización del handler:', {
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
    /**
     * Libera recursos
     */
    async shutdown() {
        this.logger.info('Liberando recursos del TextScraperHandler');
        // Cerrar canal de resultados si existe
        if (this.customChannel) {
            try {
                await this.customChannel.close();
                this.logger.info('Canal de resultados cerrado');
            }
            catch (error) {
                this.logger.error('Error cerrando canal de resultados:', {
                    error: error instanceof Error ? error.message : String(error)
                });
            }
        }
    }
    /**
     * Ejecuta la tarea seleccionando el scraper adecuado
     */
    async execute(task, context) {
        this.logger.info(`Procesando tarea de scraping ${task.id}`, {
            url: task.url || task.data?.url
        });
        let result;
        try {
            // Determinar qué método usar
            const method = this.determineMethod(task);
            this.logToContext(context, 'info', `Usando método de scraping: ${method}`);
            // Seleccionar el scraper apropiado
            const scraper = this.findScraper(task, method);
            // Ejecutar el scraping con el scraper seleccionado
            result = await scraper.execute(task, context);
            // Enviar resultado a la cola específica
            await this.sendResultToQueue(result);
            return result;
        }
        catch (error) {
            // Crear resultado de error
            const errorMsg = error instanceof Error ? error.message : String(error);
            this.logToContext(context, 'error', `Error procesando tarea: ${errorMsg}`);
            const errorResult = {
                id: task.id,
                url: task.url || task.data?.url || '',
                data: task.data,
                text: `Error: ${errorMsg}`,
                error: errorMsg,
                stats: {
                    executionTimeMs: Date.now() - context.startTime.getTime(),
                    method: this.determineMethod(task)
                },
                timestamp: new Date().toISOString()
            };
            // Intentar enviar el resultado de error a la cola
            try {
                await this.sendResultToQueue(errorResult);
                this.logger.info(`Resultado de error enviado a la cola para tarea ${task.id}`);
            }
            catch (resultError) {
                this.logger.error('Error enviando resultado de error:', {
                    error: resultError instanceof Error ? resultError.message : String(resultError)
                });
            }
            // Relanzar el error para que lo maneje el WorkerManager
            throw error;
        }
    }
    /**
     * Determina si un error es permanente
     */
    isPermanentError(error, task) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        // Errores de URL son permanentes
        if (errorMessage.includes('URL inválida') ||
            errorMessage.includes('invalid URL')) {
            return true;
        }
        // Errores 404 son permanentes
        if (errorMessage.includes('404') ||
            errorMessage.includes('not found')) {
            return true;
        }
        // Error de falta de texto/URL es permanente
        if (errorMessage.includes('No hay texto') ||
            errorMessage.includes('URL no proporcionada')) {
            return true;
        }
        // Error de no hay scrapers disponibles es permanente
        if (errorMessage.includes('No hay scrapers disponibles')) {
            return true;
        }
        // Otros errores podrían ser temporales
        return false;
    }
    /**
     * Obtiene el paso inicial de la tarea
     */
    getInitialStep(task) {
        const url = task.url || task.data?.url;
        if (url) {
            return `Iniciando scraping para URL: ${url}`;
        }
        else if (task.data?.text) {
            return `Iniciando procesamiento de texto (${task.data.text.length} caracteres)`;
        }
        else {
            return `Iniciando tarea de scraping ID: ${task.id}`;
        }
    }
    /**
     * Obtiene el tipo de worker
     */
    getWorkerType() {
        return 'text-scraper';
    }
    /**
     * Determina qué método de scraping usar para una tarea
     */
    determineMethod(task) {
        // 1. Si la tarea especifica un método explícitamente, usarlo
        const options = task.data?.options || {};
        if (options.method && options.method !== scraper_interfaces_1.ScraperMethod.AUTO) {
            return options.method;
        }
        // 2. Si la tarea requiere características de navegador, usar navegador
        if (this.requiresBrowser(task)) {
            return scraper_interfaces_1.ScraperMethod.BROWSER;
        }
        // 3. Si no, usar el método por defecto de la configuración
        return this.config.scraper?.defaultMethod || scraper_interfaces_1.ScraperMethod.LIGHT;
    }
    /**
     * Encuentra el scraper adecuado para la tarea y método
     */
    findScraper(task, preferredMethod) {
        // Primero buscar un scraper que pueda manejar explícitamente la tarea
        for (const scraper of this.scrapers) {
            if (scraper.canHandle(task)) {
                return scraper;
            }
        }
        // Si no hay un scraper explícito, buscar por tipo
        let foundScraper = null;
        if (preferredMethod === scraper_interfaces_1.ScraperMethod.BROWSER) {
            // Buscar el scraper de browser
            const browserScraper = this.scrapers.find(s => s.constructor.name.includes('Browser'));
            if (browserScraper) {
                foundScraper = browserScraper;
            }
        }
        if (!foundScraper && preferredMethod === scraper_interfaces_1.ScraperMethod.LIGHT) {
            // Buscar el scraper ligero
            const lightScraper = this.scrapers.find(s => s.constructor.name.includes('Light'));
            if (lightScraper) {
                foundScraper = lightScraper;
            }
        }
        // Si no encontramos el preferido, usar cualquiera disponible
        if (!foundScraper && this.scrapers.length > 0) {
            foundScraper = this.scrapers[0];
        }
        if (!foundScraper) {
            throw new Error('No hay scrapers disponibles para procesar la tarea');
        }
        return foundScraper;
    }
    /**
     * Determina si una tarea requiere un navegador completo
     */
    requiresBrowser(task) {
        const options = task.data?.options || {};
        // Características que requieren navegador
        return !!(options.formData || // Necesita completar formularios
            options.clicks || // Necesita hacer clics
            options.screenshot || // Necesita tomar capturas
            options.waitFor // Necesita esperar elementos dinámicos
        );
    }
    /**
     * Envía un resultado a la cola
     */
    async sendResultToQueue(result) {
        if (!this.resultQueue) {
            return false; // No hay cola configurada
        }
        try {
            // Usar el canal personalizado si existe
            if (this.customChannel) {
                this.customChannel.sendToQueue(this.resultQueue, Buffer.from(JSON.stringify(result)), { persistent: true });
                this.logger.info(`Resultado enviado a la cola ${this.resultQueue} para tarea ${result.id}`);
                return true;
            }
            else {
                this.logger.warn(`No hay canal disponible para enviar el resultado a ${this.resultQueue}`);
                return false;
            }
        }
        catch (error) {
            this.logger.error('Error enviando resultado a la cola:', {
                error: error instanceof Error ? error.message : String(error)
            });
            return false;
        }
    }
    /**
     * Registra un mensaje de log en el contexto de una tarea
     */
    logToContext(context, level, message) {
        // Mapear 'warning' a 'warn' para el TaskLog para que sea compatible con la interfaz
        const taskLogLevel = level === 'warning' ? 'warn' : level;
        context.logs.push({
            timestamp: new Date(),
            level: taskLogLevel,
            message
        });
        // También mapear para el logger usando switch para evitar indexación
        switch (level) {
            case 'info':
                this.logger.info(message);
                break;
            case 'warning':
                this.logger.warn(message);
                break;
            case 'error':
                this.logger.error(message);
                break;
            case 'debug':
                this.logger.debug(message);
                break;
        }
    }
}
exports.TextScraperHandler = TextScraperHandler;
