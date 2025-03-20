import {
  ScraperTask,
  ScraperResult,
  TaskContext,
  WorkerConfig,
  ScraperMethod
} from './types';
import { BaseScraper } from './base-scraper';
import * as cheerio from 'cheerio';

/**
 * Implementación de scraper ligero usando Fetch+Cheerio
 * Optimizado para tareas sencillas que no requieren interacción compleja
 */
export class LightScraper extends BaseScraper {
  private initialized: boolean = false;

  constructor(config: WorkerConfig) {
    super(config);
  }

  /**
   * Inicializa recursos para el scraper ligero
   */
  public async initialize(): Promise<void> {
    this.initialized = true;
  }

  /**
   * Libera recursos
   */
  public async cleanup(): Promise<void> {
    // No hay recursos específicos que limpiar
    this.initialized = false;
  }

  /**
   * Verifica si este scraper puede manejar la tarea
   */
  public canHandle(task: ScraperTask): boolean {
    // Este scraper puede manejar tareas sin requerimientos de navegador
    const options = this.getOptions(task);
    return !(
      options.formData ||     // No puede completar formularios
      options.clicks ||       // No puede hacer clics
      options.screenshot ||   // No puede tomar capturas
      options.waitFor         // No puede esperar elementos dinámicos
    );
  }

  /**
   * Ejecuta una tarea de scraping usando Fetch+Cheerio
   */
  public async execute(task: ScraperTask, context: TaskContext): Promise<ScraperResult> {
    if (!this.initialized) {
      throw new Error('LightScraper no está inicializado');
    }

    const url = this.getUrl(task);
    if (!url) {
      throw new Error('URL no proporcionada para scraping');
    }

    const selector = this.getSelector(task);
    const options = this.getOptions(task);

    // Registrar inicio de scraping
    this.log(context, 'info', `Iniciando scraping ligero para URL: ${url}`);

    const startTime = Date.now();

    try {
      // Configurar opciones de la solicitud
      const requestOptions: RequestInit = {
        headers: {
          'user-agent': options.userAgent || this.config.scraper?.userAgent ||
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        },
        signal: AbortSignal.timeout(options.timeout || 30000)
      };

      // Realizar la solicitud HTTP usando fetch nativo
      this.log(context, 'info', `Realizando solicitud GET a ${url}`);

      const response = await fetch(url, requestOptions);

      if (!response.ok) {
        throw new Error(`Error HTTP: ${response.status} ${response.statusText}`);
      }

      const html = await response.text();

      if (!html) {
        throw new Error('Respuesta vacía del servidor');
      }

      // Cargar HTML en Cheerio
      const $ = cheerio.load(html);

      // Extraer texto según selector o usar el texto de toda la página
      let text: string;
      let extractedHtml: string;

      if (selector) {
        const elements = $(selector);
        if (elements.length === 0) {
          this.log(context, 'warning', `Selector "${selector}" no encontrado, usando el contenido completo`);
          text = $('body').text().trim();
          extractedHtml = $('body').html() || '';
        } else {
          text = elements.text().trim();
          extractedHtml = elements.html() || '';
        }
      } else {
        text = $('body').text().trim();
        extractedHtml = $('body').html() || '';
      }

      // Procesar el texto según opciones
      const processedText = this.processText(text, options);

      // Buscar palabras clave si se especifican
      let keywordsFound: string[] = [];
      if (options.keywords && options.keywords.length > 0) {
        keywordsFound = options.keywords.filter(keyword =>
          text.toLowerCase().includes(keyword.toLowerCase())
        );

        if (keywordsFound.length > 0) {
          this.log(context, 'info', `Palabras clave encontradas: ${keywordsFound.join(', ')}`);
        } else {
          this.log(context, 'info', 'No se encontraron palabras clave');
        }
      }

      // Registrar fin de scraping
      const endTime = Date.now();
      const executionTime = endTime - startTime;
      this.log(context, 'info', `Scraping completado en ${executionTime}ms (${text.length} caracteres extraídos)`);

      // Crear resultado
      const result: ScraperResult = {
        id: task.id,
        url: url,
        data: task.data,
        text: text.substring(0, 1000), // Versión corta del texto original
        html: extractedHtml.substring(0, 5000), // Versión corta del HTML original
        processedText,
        stats: {
          originalLength: text.length,
          processedLength: processedText.length,
          wordCount: processedText.split(/\s+/).filter(Boolean).length,
          executionTimeMs: executionTime,
          method: ScraperMethod.LIGHT,
          keywordsFound: keywordsFound.length > 0 ? keywordsFound : undefined
        },
        timestamp: new Date().toISOString()
      };

      return result;
    } catch (error) {
      // Registrar error
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log(context, 'error', `Error en scraping ligero: ${errorMessage}`);

      // Crear resultado de error
      const endTime = Date.now();
      const executionTime = endTime - startTime;

      return {
        id: task.id,
        url: url,
        data: task.data,
        text: `Error: ${errorMessage}`,
        error: errorMessage,
        stats: {
          executionTimeMs: executionTime,
          method: ScraperMethod.LIGHT
        },
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Registra un mensaje de log en el contexto
   */
  protected log(context: TaskContext, level: 'info' | 'warning' | 'error' | 'debug', message: string): void {
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
