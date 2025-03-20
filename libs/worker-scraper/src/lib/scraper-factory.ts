import { Logger } from '@jupiter/worker-framework';
import { ScraperTask, ScraperMethod, ScraperWorkerConfig } from './scraper-interfaces';
import { Scraper } from './scraper-interfaces';

export class ScraperFactory {
  /**
   * Determina qué método de scraping utilizar según la tarea y configuración
   */
  static determineMethod(task: ScraperTask, config: ScraperWorkerConfig): ScraperMethod {
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
  static requiresBrowser(task: ScraperTask): boolean {
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
   * Encuentra el scraper adecuado para la tarea
   */
  static findScraper(task: ScraperTask, scrapers: Scraper[], config: ScraperWorkerConfig, logger: Logger): Scraper {
    // Primero intentar encontrar un scraper que pueda manejar la tarea explícitamente
    for (const scraper of scrapers) {
      if (scraper.canHandle(task)) {
        return scraper;
      }
    }

    // Si ninguno puede manejar explícitamente, determinar el método y buscar uno compatible
    const method = this.determineMethod(task, config);

    logger.info(`Using scraping method: ${method}`);

    // Encontrar un scraper que tenga la capacidad adecuada
    const matchingScraper = scrapers.find(scraper => {
      // BrowserScraper puede manejar tareas de browser
      if (method === ScraperMethod.BROWSER && scraper.constructor.name === 'BrowserScraper') {
        return true;
      }

      // LightScraper puede manejar tareas light
      if (method === ScraperMethod.LIGHT && scraper.constructor.name === 'LightScraper') {
        return true;
      }

      return false;
    });

    if (!matchingScraper) {
      throw new Error(`No suitable scraper found for method: ${method}`);
    }

    return matchingScraper;
  }
}
