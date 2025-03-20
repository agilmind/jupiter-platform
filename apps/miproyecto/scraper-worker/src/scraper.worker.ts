import { chromium } from 'playwright';
import { WorkerTask, TaskContext, WorkerConfig } from './types';
import { BaseWorker } from './base-worker';
import * as amqp from 'amqplib';

// Interfaces base
export interface ScraperTask extends WorkerTask {
  url?: string;
  selector?: string;
  data?: any;
}

export interface ScraperResult {
  id: string;
  url?: string;
  data?: any;
  text: string;
  timestamp: string;
}

// Extendemos la interfaz Connection para asegurarnos de que TypeScript reconozca createChannel
declare module 'amqplib' {
  interface Connection {
    createChannel(): Promise<Channel>;
  }
}

/**
 * Worker abstracto para realizar scraping de sitios web
 * Contiene la lógica común a todos los scrapers
 */
export abstract class AbstractScraperWorker<
  T extends ScraperTask = ScraperTask,
  R extends ScraperResult = ScraperResult
> extends BaseWorker<T, R> {

  protected connection: amqp.Connection | null = null;
  protected channel: amqp.Channel | null = null;
  protected resultQueue: string;

  constructor(config: WorkerConfig) {
    super(config);
    this.resultQueue = config.queue.resultQueue || 'result_queue';
  }

  /**
   * Detiene el worker
   */
  public override async shutdown(): Promise<void> {
    try {
      // Llamar primero al shutdown de la clase base
      await super.shutdown();

      // Cerrar recursos específicos del scraper
      if (this.channel) {
        await this.channel.close();
      }

      if (this.connection) {
        await this.connection.close();
      }

      console.log('Conexiones del scraper cerradas correctamente');
    } catch (error) {
      console.error('Error al cerrar conexiones del scraper:', error);
      throw error;
    }
  }

  /**
   * Inicializa recursos específicos del worker
   */
  protected async initialize(): Promise<void> {
    try {
      console.log('Verificando disponibilidad de Playwright...');

      // Primero intentamos conectar a RabbitMQ
      console.log('Conectando a RabbitMQ...');
      try {
        this.connection = await amqp.connect(this.config.queue.url);

        if (this.connection) {
          this.channel = await this.connection.createChannel();
          await this.channel.assertQueue(this.resultQueue, { durable: true });
          console.log('Conexión a RabbitMQ establecida correctamente');
        }
      } catch (error: any) {
        console.error('Error conectando a RabbitMQ:', error.message);
        throw error;
      }

      // Probamos Playwright con timeouts y retry
      let playwright_ready = false;
      let retry_count = 0;
      const max_retries = 3;

      while (!playwright_ready && retry_count < max_retries) {
        try {
          console.log(
            `Probando Playwright (intento ${retry_count + 1}/${max_retries})...`
          );
          const browser = await chromium.launch({
            headless: true,
            timeout: 30000,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
          });
          await browser.close();
          playwright_ready = true;
          console.log('Playwright está disponible y funcionando correctamente');
        } catch (error: any) {
          retry_count++;
          console.error(
            `Error probando Playwright (intento ${retry_count}/${max_retries}):`,
            error.message
          );
          if (retry_count >= max_retries) {
            throw error;
          }
          // Esperar antes del siguiente intento
          await new Promise((resolve) => setTimeout(resolve, 5000));
        }
      }
    } catch (error: any) {
      console.error('Error en la inicialización:', error);
      throw new Error(`Error inicializando recursos: ${error.message}`);
    }
  }

  /**
   * Implementación adaptada para ser compatible con BaseWorker
   */
  protected override async processTask(task: T, channel: any): Promise<boolean> {
    const context: TaskContext = {
      id: task.id,
      attempt: task.retryCount || 0,
      startedAt: new Date(),
      logs: [],
    };

    try {
      this.log(context, 'info', this.getInitialStep(task));

      // Llamar al método especializado para procesar la tarea
      const result = await this.executeTask(task, context);

      // Enviar el resultado a la cola si hay un canal disponible
      if (this.channel) {
        this.channel.sendToQueue(
          this.resultQueue,
          Buffer.from(JSON.stringify(result)),
          { persistent: true }
        );
        this.log(context, 'info', `Resultado enviado a la cola ${this.resultQueue}`);
      }

      return true;
    } catch (error) {
      this.log(
        context,
        'error',
        `Error procesando tarea: ${error instanceof Error ? error.message : String(error)}`
      );
      return false;
    }
  }

  /**
   * Método abstracto que debe ser implementado por cada scraper específico
   */
  protected abstract executeTask(task: T, context: TaskContext): Promise<R>;

  /**
   * Determina si un error es permanente (no se debe reintentar)
   */
  protected isPermanentError(error: any, task: T): boolean {
    // Errores de formato de URL son permanentes
    if (error.message && error.message.includes('URL inválida')) {
      return true;
    }

    // Errores 404 son permanentes
    if (
      error.message &&
      (error.message.includes('404') || error.message.includes('not found'))
    ) {
      return true;
    }

    // Otros errores podrían ser temporales (problemas de red, etc.)
    return false;
  }

  /**
   * Retorna el tipo de worker para logging
   */
  protected getWorkerType(): string {
    return 'scraper';
  }

  /**
   * Retorna el paso inicial para esta tarea
   */
  protected getInitialStep(task: T): string {
    return `Iniciando scraping para tarea ${task.id}`;
  }
}
