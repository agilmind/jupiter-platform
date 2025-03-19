import { chromium } from 'playwright';
import { WorkerTask, TaskContext, WorkerConfig } from './types';
import { BaseWorker } from './base-worker';
import { extractTextFromPage } from './utils/playwright-utils';

// Conexión a RabbitMQ
import * as amqp from 'amqplib';

// Definición de la tarea específica para este worker
export interface ScraperTask extends WorkerTask {
  url: string;
  selector?: string;
}

// Definición del resultado
export interface ScraperResult {
  id: string; // Añadido id para evitar error
  url: string;
  text: string;
  timestamp: string;
}

/**
 * Worker para realizar scraping de sitios web
 */
export class ScraperWorker extends BaseWorker<ScraperTask, ScraperResult> {
  // Añadir la propiedad connection
  private connection: amqp.Connection | null = null;
  private channel: amqp.Channel | null = null;
  private resultQueue: string;

  constructor(config: WorkerConfig) {
    super(config);
    this.resultQueue = process.env.RESULT_QUEUE || 'result_queue';
  }

  /**
   * Inicializa recursos específicos del worker
   */
  protected async initialize(): Promise<void> {
    try {
      console.log('Verificando disponibilidad de Playwright...');

      // Primero intentamos conectar a RabbitMQ, ya que es menos intensivo
      console.log('Conectando a RabbitMQ...');
      try {
        this.connection = await amqp.connect(this.config.queue.url);
        this.channel = await this.connection.createChannel();
        await this.channel.assertQueue(this.resultQueue, { durable: true });
        console.log('Conexión a RabbitMQ establecida correctamente');
      } catch (error: any) {
        console.error('Error conectando a RabbitMQ:', error.message);
        throw error;
      }

      // Ahora probamos Playwright con timeouts y retry
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
   * Implementa la lógica de scraping
   */
  protected async executeTask(
    task: ScraperTask,
    context: TaskContext
  ): Promise<ScraperResult> {
    this.log(context, 'info', `Iniciando scraping para URL: ${task.url}`);

    // Validar la URL
    if (!task.url || !task.url.startsWith('http')) {
      throw new Error(`URL inválida: ${task.url}`);
    }

    const browser = await chromium.launch({ headless: true });
    try {
      this.log(context, 'info', 'Navegando a la página');

      // Crear una nueva página
      const page = await browser.newPage();

      // Navegar a la URL
      await page.goto(task.url, { waitUntil: 'domcontentloaded' });

      // Extraer texto según el selector o usar el texto de toda la página
      const text = await extractTextFromPage(page, task.selector);

      this.log(context, 'info', `Texto extraído (${text.length} caracteres)`);

      // Crear el resultado
      const result: ScraperResult = {
        id: task.id,
        url: task.url,
        text: text.substring(0, 500), // Limitamos a 500 caracteres
        timestamp: new Date().toISOString(),
      };

      // Enviar resultado a la cola
      try {
        if (this.channel) {
          this.channel.sendToQueue(
            this.resultQueue,
            Buffer.from(JSON.stringify(result)),
            { persistent: true }
          );
          this.log(
            context,
            'info',
            `Resultado enviado a la cola ${this.resultQueue}`
          );
        } else {
          this.log(
            context,
            'warning',
            'No hay canal disponible para enviar resultados'
          );
        }
      } catch (error: any) {
        this.log(
          context,
          'error',
          `Error enviando resultado: ${error.message}`
        );
      }

      return result;
    } finally {
      // Asegurarnos de cerrar el navegador
      await browser.close();
      this.log(context, 'info', 'Navegador cerrado');
    }
  }

  /**
   * Determina si un error es permanente (no se debe reintentar)
   */
  protected isPermanentError(error: any, task: ScraperTask): boolean {
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
  protected getInitialStep(task: ScraperTask): string {
    return `Iniciando scraping para ${task.url}`;
  }
}
