import {
  WorkerConfig,
  TaskContext,
  ScraperTask,
  ScraperResult,
  ScraperMethod
} from './types';
import { BaseWorker } from './base-worker';
import { BaseScraper, ScraperFactory } from './base-scraper';
import { BrowserScraper } from './browser-scraper';
import { LightScraper } from './light-scraper';
import * as amqp from 'amqplib';

/**
 * TextScraper: Implementación del worker que decide y utiliza
 * el método de scraping apropiado según la complejidad de la tarea
 */
export class TextScraper extends BaseWorker<ScraperTask, ScraperResult> {
  private resultQueue: string;
  private customChannel: amqp.Channel | null = null;

  // Instancias de los scrapers
  private browserScraper: BrowserScraper | null = null;
  private lightScraper: LightScraper | null = null;

  constructor(config: WorkerConfig) {
    super(config);
    this.resultQueue = config.queue.resultQueue || 'result_queue';

    // Agregar configuración por defecto para el scraper si no existe
    if (!config.scraper) {
      config.scraper = {
        maxConcurrentBrowsers: 3,
        defaultMethod: ScraperMethod.AUTO
      };
    }
  }

  /**
   * Inicializa recursos (navegador, conexiones, etc.)
   */
  protected async initialize(): Promise<void> {
    this.logSystem('info', 'Inicializando TextScraper con arquitectura dual');

    try {
      // Inicializar canal de resultado separado
      try {
        console.log('Configurando canal para cola de resultados...');
        const connection = await amqp.connect(this.config.queue.url);
        this.customChannel = await connection.createChannel();
        await this.customChannel.assertQueue(this.resultQueue, { durable: true });
        console.log(`Canal de resultados configurado para cola: ${this.resultQueue}`);
      } catch (error) {
        console.error('Error configurando canal de resultados:', error);
        // No lanzamos error para permitir continuar sin este canal (modo degradado)
      }

      // Inicializar scrapers
      // Primero el scraper ligero que casi siempre debería funcionar
      this.lightScraper = new LightScraper(this.config);
      await this.lightScraper.initialize().catch(error => {
        console.warn('Error inicializando LightScraper, algunas funcionalidades no estarán disponibles:', error);
      });

      // Luego el scraper con navegador que podría fallar en entornos limitados
      try {
        this.browserScraper = new BrowserScraper(this.config);
        await this.browserScraper.initialize();
        this.logSystem('info', 'Navegador inicializado correctamente');
      } catch (error) {
        console.warn('Navegador no disponible. Funcionalidades complejas limitadas:', error);
        // No lanzamos error para permitir el modo fallback sin navegador
      }

    } catch (error) {
      this.logSystem('error', `Error en inicialización: ${error instanceof Error ? error.message : String(error)}`);

      // Este error sí lo lanzamos porque es crítico
      throw error;
    }
  }

  /**
   * Detiene el worker y libera recursos
   */
  public override async shutdown(): Promise<void> {
    // Llamar al método de la clase base primero
    await super.shutdown();

    // Añadir limpieza específica del scraper
    console.log('Liberando recursos específicos del TextScraper');

    // Cerrar canal de resultados si existe
    if (this.customChannel) {
      try {
        await this.customChannel.close();
        console.log('Canal de resultados cerrado');
      } catch (error) {
        console.error('Error cerrando canal de resultados:', error);
      }
    }

    // Liberar recursos de los scrapers
    if (this.lightScraper) {
      await this.lightScraper.cleanup().catch(error => {
        console.error('Error cerrando LightScraper:', error);
      });
    }

    if (this.browserScraper) {
      await this.browserScraper.cleanup().catch(error => {
        console.error('Error cerrando BrowserScraper:', error);
      });
    }
  }

  /**
   * Procesa una tarea (compatibilidad con BaseWorker)
   */
  protected override async processTask(task: ScraperTask, channel: any): Promise<boolean> {
    // Crear contexto para la tarea
    const context: TaskContext = {
      id: task.id,
      attempt: task.retryCount || 0,
      startedAt: new Date(),
      logs: [],
    };

    console.log(`Procesando tarea ${task.id}:`, JSON.stringify(task));

    try {
      // Ejecutar la tarea con el método más apropiado
      const result = await this.executeTask(task, context);

      // Enviar resultado a la cola
      const success = await this.sendResultToQueue(result);
      console.log(`Resultado enviado a la cola: ${success ? 'OK' : 'FALLO'}`);

      // Devolver true para indicar éxito
      return true;
    } catch (error) {
      // Loguear el error
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logToContext(context, 'error', `Error procesando tarea: ${errorMsg}`);

      // Crear y enviar resultado de error
      try {
        const errorResult: ScraperResult = {
          id: task.id,
          data: task.data,
          text: `Error: ${errorMsg}`,
          error: errorMsg,
          timestamp: new Date().toISOString()
        };

        await this.sendResultToQueue(errorResult);
        console.log(`Resultado de error enviado a la cola para tarea ${task.id}`);
      } catch (resultError) {
        console.error('Error enviando resultado de error:', resultError);
      }

      // Devolver false para indicar fallo
      return false;
    }
  }

  /**
   * Ejecuta una tarea de scraping con el método más apropiado
   */
  protected async executeTask(
    task: ScraperTask,
    context: TaskContext
  ): Promise<ScraperResult> {
    console.log(`Ejecutando tarea ${task.id}`);

    // Determinar qué método usar
    const method = this.determineMethod(task);
    this.logToContext(context, 'info', `Usando método de scraping: ${method}`);

    // Seleccionar el scraper apropiado
    let scraper: BaseScraper | null = null;

    if (method === ScraperMethod.BROWSER && this.browserScraper) {
      scraper = this.browserScraper;
    } else if (method === ScraperMethod.LIGHT && this.lightScraper) {
      scraper = this.lightScraper;
    } else if (this.lightScraper) {
      // Fallback a light si el método preferido no está disponible
      scraper = this.lightScraper;
      this.logToContext(context, 'warning', `Método ${method} no disponible, usando scraper ligero como fallback`);
    } else if (this.browserScraper) {
      // Fallback a browser si es lo único disponible
      scraper = this.browserScraper;
      this.logToContext(context, 'warning', `Método ${method} no disponible, usando scraper con navegador como fallback`);
    } else {
      // No hay scrapers disponibles
      throw new Error('No hay scrapers disponibles para procesar la tarea');
    }

    // Ejecutar el scraping con el scraper seleccionado
    return await scraper.execute(task, context);
  }

  /**
   * Determina qué método de scraping usar para una tarea
   */
  private determineMethod(task: ScraperTask): ScraperMethod {
    // 1. Si la tarea especifica un método explícitamente, usarlo
    const options = task.data?.options || {};
    if (options.method && options.method !== ScraperMethod.AUTO) {
      return options.method;
    }

    // 2. Si la tarea requiere características de navegador, usar navegador
    if (this.requiresBrowser(task)) {
      return ScraperMethod.BROWSER;
    }

    // 3. Si no, usar el método por defecto de la configuración
    return this.config.scraper?.defaultMethod || ScraperMethod.LIGHT;
  }

  /**
   * Determina si una tarea requiere un navegador completo
   */
  private requiresBrowser(task: ScraperTask): boolean {
    const options = task.data?.options || {};

    // Características que requieren navegador
    return !!(
      options.formData ||     // Necesita completar formularios
      options.clicks ||       // Necesita hacer clics
      options.screenshot ||   // Necesita tomar capturas
      options.waitFor         // Necesita esperar elementos dinámicos
    );
  }

  /**
   * Envía un resultado a la cola
   */
  private async sendResultToQueue(result: ScraperResult): Promise<boolean> {
    try {
      // Primero intentamos con el canal personalizado
      if (this.customChannel) {
        this.customChannel.sendToQueue(
          this.resultQueue,
          Buffer.from(JSON.stringify(result)),
          { persistent: true }
        );
        console.log(`[Canal Dedicado] Resultado enviado a la cola ${this.resultQueue} para tarea ${result.id}`);
        return true;
      }

      // Si no hay canal personalizado, intentamos con el canal general
      console.log('Canal dedicado no disponible, buscando canal alternativo...');

      // Acceso al canal a través de las propiedades del worker base
      // @ts-ignore - Ignorar error de acceso a propiedad protegida/privada
      const baseChannel = this.queueConsumer?.channel || this.channel;

      if (baseChannel) {
        baseChannel.sendToQueue(
          this.resultQueue,
          Buffer.from(JSON.stringify(result)),
          { persistent: true }
        );
        console.log(`[Canal Base] Resultado enviado a la cola ${this.resultQueue} para tarea ${result.id}`);
        return true;
      }

      console.error('No hay canales disponibles para enviar el resultado');
      return false;
    } catch (error) {
      console.error('Error enviando resultado a la cola:', error);
      return false;
    }
  }

  /**
   * Determina si un error es permanente
   */
  protected isPermanentError(error: any, task: ScraperTask): boolean {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Errores de URL son permanentes
    if (errorMessage.includes('URL inválida')) {
      return true;
    }

    // Errores 404 son permanentes
    if (errorMessage.includes('404') || errorMessage.includes('not found')) {
      return true;
    }

    // Error de falta de texto/URL es permanente
    if (errorMessage.includes('No hay texto') || errorMessage.includes('URL no proporcionada')) {
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
   * Retorna el tipo de worker para logging
   */
  protected getWorkerType(): string {
    return 'text-scraper';
  }

  /**
   * Retorna el paso inicial para esta tarea
   */
  protected getInitialStep(task: ScraperTask): string {
    const url = task.url || task.data?.url;

    if (url) {
      return `Iniciando scraping para URL: ${url}`;
    } else if (task.data?.text) {
      return `Iniciando procesamiento de texto (${task.data.text.length} caracteres)`;
    } else {
      return `Iniciando tarea de scraping ID: ${task.id}`;
    }
  }

  /**
   * Log de sistema (sin contexto de tarea)
   */
  private logSystem(level: 'info' | 'warning' | 'error' | 'debug', message: string): void {
    console.log(`[SYSTEM] [${level.toUpperCase()}] ${message}`);
  }

  /**
   * Registra un mensaje de log en el contexto de una tarea
   */
  private logToContext(context: TaskContext, level: 'info' | 'warning' | 'error' | 'debug', message: string): void {
    if (!context.logs) {
      context.logs = [];
    }

    context.logs.push({
      timestamp: new Date(),
      level,
      message
    });

    // Utilizar console para logging inmediato también
    switch (level) {
      case 'info':
        console.log(`[${context.id}] ${message}`);
        break;
      case 'warning':
        console.warn(`[${context.id}] ${message}`);
        break;
      case 'error':
        console.error(`[${context.id}] ${message}`);
        break;
      case 'debug':
        console.debug(`[${context.id}] ${message}`);
        break;
    }
  }
}
