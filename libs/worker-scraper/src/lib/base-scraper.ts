import {
  ScraperTask,
  ScraperResult,
  ScraperMethod,
  ScraperOptions,
  ScraperWorkerConfig
} from './types';
import { BaseWorker, TaskContext, WorkerConfig } from '@jupiter/worker-framework';

/**
 * Clase base para scrapers
 */
export abstract class BaseScraper<
  T extends ScraperTask = ScraperTask,
  R extends ScraperResult = ScraperResult
> extends BaseWorker<T, R> {
  constructor(config: ScraperWorkerConfig) {
    super(config);
  }

  /**
   * Inicializa los recursos necesarios para el scraper
   */
  public abstract override initialize(): Promise<void>;

  /**
   * Libera recursos y cierra conexiones
   */
  public abstract cleanup(): Promise<void>;

  /**
   * Método principal para ejecutar una tarea de scraping
   */
  public abstract execute(task: ScraperTask, context: TaskContext): Promise<ScraperResult>;

  /**
   * Comprueba si este scraper puede manejar la tarea específica
   */
  public abstract canHandle(task: ScraperTask): boolean;

  /**
   * Procesa el texto extraído según las opciones
   */
  protected processText(text: string, options?: ScraperOptions): string {
    let processed = text;

    // Eliminar etiquetas HTML si se solicita
    if (options?.removeHtml) {
      processed = processed.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    }

    // Limitar longitud si se especifica
    if (options?.maxLength && processed.length > options.maxLength) {
      processed = processed.substring(0, options.maxLength);
    }

    return processed;
  }

  /**
   * Extrae la URL de la tarea
   */
  protected getUrl(task: ScraperTask): string {
    // Intentar obtener la URL de diferentes lugares posibles
    return task.url || task.data?.url || '';
  }

  /**
   * Extrae el selector de la tarea
   */
  protected getSelector(task: ScraperTask): string {
    return task.selector || '';
  }

  /**
   * Extrae las opciones de la tarea
   */
  protected getOptions(task: ScraperTask): ScraperOptions {
    return task.data?.options || {};
  }
}

/**
 * Factory para crear el scraper apropiado según el tipo de tarea
 */
export class ScraperFactory {
  /**
   * Crea la instancia de scraper adecuada según la tarea y configuración
   */
  static async create(
    task: ScraperTask,
    config: WorkerConfig,
    browserScraper: any, // Cambio para evitar instanciar clases abstractas
    lightScraper: any    // Cambio para evitar instanciar clases abstractas
  ): Promise<BaseScraper> {
    // Determinar el método a utilizar
    const method = this.determineMethod(task, config);

    // Instanciar el scraper adecuado
    let scraper: BaseScraper;

    if (method === ScraperMethod.BROWSER) {
      scraper = new browserScraper(config);
    } else {
      scraper = new lightScraper(config);
    }

    // Inicializar el scraper
    await scraper.initialize();

    return scraper;
  }

  /**
   * Determina qué método de scraping utilizar según la tarea y la configuración
   */
  private static determineMethod(task: ScraperTask, config: ScraperWorkerConfig): ScraperMethod {
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
    return config.scraper?.defaultMethod || ScraperMethod.LIGHT;
  }

  /**
   * Determina si una tarea requiere un navegador completo
   */
  private static requiresBrowser(task: ScraperTask): boolean {
    const options = task.data?.options || {};

    // Características que requieren navegador
    return !!(
      options.formData ||     // Necesita completar formularios
      options.clicks ||       // Necesita hacer clics
      options.screenshot ||   // Necesita tomar capturas
      options.waitFor         // Necesita esperar elementos dinámicos
    );
  }
}
