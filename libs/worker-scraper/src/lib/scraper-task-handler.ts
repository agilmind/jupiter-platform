import {
  TaskHandler,
  TaskContext,
  Logger
} from '@jupiter/worker-framework';

import {
  ScraperTask,
  ScraperResult,
  ScraperWorkerConfig,
  Scraper
} from './scraper-interfaces';

import { ScraperFactory } from './scraper-factory';

/**
 * Clase que implementa TaskHandler para gestionar tareas de scraping
 * Utiliza composición para trabajar con diferentes scrapers
 */
export class ScraperTaskHandler implements TaskHandler<ScraperTask, ScraperResult> {
  private scrapers: Scraper[];
  private config: ScraperWorkerConfig;
  private logger: Logger;

  constructor(scrapers: Scraper[], config: ScraperWorkerConfig, logger: Logger) {
    this.scrapers = scrapers;
    this.config = config;
    this.logger = logger;
  }

  /**
   * Ejecuta la tarea seleccionando el scraper adecuado
   */
  async execute(task: ScraperTask, context: TaskContext): Promise<ScraperResult> {
    this.logger.info(`Processing scraping task ${task.id}`, { url: task.url || task.data?.url });

    // Encontrar el scraper adecuado para la tarea
    const scraper = ScraperFactory.findScraper(task, this.scrapers, this.config, this.logger);

    // Ejecutar el scraping
    return await scraper.execute(task, context);
  }

  /**
   * Determina si un error es permanente
   */
  isPermanentError(error: unknown, task: ScraperTask): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();

      // Errores permanentes típicos en scraping
      if (message.includes('404') ||
          message.includes('not found') ||
          message.includes('forbidden') ||
          message.includes('permission denied') ||
          message.includes('invalid url')) {
        return true;
      }

      // Errores de validación son permanentes
      if (message.includes('validation failed') ||
          message.includes('invalid parameter')) {
        return true;
      }
    }

    return false;
  }

  /**
   * Obtiene el paso inicial de la tarea
   */
  getInitialStep(task: ScraperTask): string {
    return 'scraping';
  }

  /**
   * Obtiene el tipo de worker
   */
  getWorkerType(): string {
    return 'scraper';
  }
}
