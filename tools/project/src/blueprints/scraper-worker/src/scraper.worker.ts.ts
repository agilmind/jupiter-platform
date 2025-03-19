import { GeneratorOptions } from '../../types';

export function scraperWorkerTs(options: GeneratorOptions): string {
  return `import { chromium } from 'playwright';
import {
  WorkerTask,
  TaskContext,
  WorkerConfig
} from './types';
import { BaseWorker } from './base-worker';
import { extractTextFromPage } from './utils/playwright-utils';

// Definición de la tarea específica para este worker
export interface ScraperTask extends WorkerTask {
  url: string;
  selector?: string;
}

// Definición del resultado
export interface ScraperResult {
  url: string;
  text: string;
  timestamp: string;
}

/**
 * Worker para realizar scraping de sitios web
 */
export class ScraperWorker extends BaseWorker<ScraperTask, ScraperResult> {
  constructor(config: WorkerConfig) {
    super(config);
  }

  /**
   * Inicializa recursos específicos del worker
   * (En este caso, no necesitamos nada especial, pero deberíamos verificar
   * que Playwright esté correctamente instalado)
   */
  protected async initialize(): Promise<void> {
    // Verificar que Playwright está disponible
    try {
      const browser = await chromium.launch({ headless: true });
      await browser.close();
    } catch (error) {
      throw new Error(\`Error inicializando Playwright: \${error.message}\`);
    }
  }

  /**
   * Implementa la lógica de scraping
   */
  protected async executeTask(task: ScraperTask, context: TaskContext): Promise<ScraperResult> {
    this.log(context, 'info', \`Iniciando scraping para URL: \${task.url}\`);

    // Validar la URL
    if (!task.url || !task.url.startsWith('http')) {
      throw new Error(\`URL inválida: \${task.url}\`);
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

      this.log(context, 'info', \`Texto extraído (\${text.length} caracteres)\`);

      // Crear y devolver el resultado
      const result: ScraperResult = {
        url: task.url,
        text: text.substring(0, 500), // Limitamos a 500 caracteres
        timestamp: new Date().toISOString()
      };

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
    if (error.message && (
      error.message.includes('404') ||
      error.message.includes('not found')
    )) {
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
    return \`Iniciando scraping para \${task.url}\`;
  }
}`;
}
