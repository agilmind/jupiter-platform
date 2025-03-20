import {
  ScraperTask,
  ScraperResult,
  TaskContext,
  WorkerConfig,
  ScraperMethod,
  ScraperOptions,
  FormDataEntry,
  ClickAction,
  ProxySettings,
  BrowserContextOptions
} from './types';
import { BaseScraper } from './base-scraper';
import { chromium, Browser, Page, BrowserContext } from 'playwright';

/**
 * Implementación de scraper basado en navegador usando Playwright
 * Capaz de manejar interacciones complejas, JavaScript, formularios, etc.
 */
export class BrowserScraper extends BaseScraper {
  private browser: Browser | null = null;
  private browserInitialized: boolean = false;
  private concurrentPages: number = 0;
  private proxyIndex: number = 0;

  constructor(config: WorkerConfig) {
    super(config);
  }

  /**
   * Inicializa el navegador
   */
  public async initialize(): Promise<void> {
    try {
      // Lanzar navegador si aún no existe
      if (!this.browser) {
        this.browser = await chromium.launch({
          headless: this.config.browser?.headless ?? true,
          timeout: this.config.browser?.timeout ?? 30000,
          args: this.config.browser?.args || ['--no-sandbox', '--disable-setuid-sandbox']
        });
        this.browserInitialized = true;
      }
    } catch (error) {
      console.error('Error inicializando navegador:', error);
      throw new Error(`Error inicializando navegador: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Libera recursos del navegador
   */
  public async cleanup(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    this.browserInitialized = false;
  }

  /**
   * Verifica si este scraper puede manejar la tarea
   */
  public canHandle(task: ScraperTask): boolean {
    // Este scraper puede manejar cualquier tipo de tarea
    return this.browserInitialized;
  }

  /**
   * Ejecuta una tarea de scraping usando Playwright
   */
  public async execute(task: ScraperTask, context: TaskContext): Promise<ScraperResult> {
    if (!this.browserInitialized || !this.browser) {
      throw new Error('BrowserScraper no está inicializado correctamente');
    }

    const url = this.getUrl(task);
    if (!url) {
      throw new Error('URL no proporcionada para scraping');
    }

    const selector = this.getSelector(task);
    const options = this.getOptions(task);

    // Registrar inicio de scraping
    this.log(context, 'info', `Iniciando scraping con navegador para URL: ${url}`);

    // Controlar concurrencia
    const maxConcurrency = this.config.scraper?.maxConcurrentBrowsers || 3;
    if (this.concurrentPages >= maxConcurrency) {
      this.log(context, 'warning', `Esperando para no exceder límite de concurrencia (${maxConcurrency})`);
      await new Promise(resolve => setTimeout(resolve, 500 * this.concurrentPages));
    }

    this.concurrentPages++;
    const startTime = Date.now();
    let browser: Browser | null = null;
    let page: Page | null = null;
    let screenshot: string | undefined;

    try {
      // Configurar el navegador con las opciones avanzadas
      const browserOptions = this.prepareBrowserOptions(options);
      browser = await chromium.launch(browserOptions);

      // Configurar el contexto del navegador (para anti-detección)
      const contextOptions = this.prepareContextOptions(options);
      const browserContext = await browser.newContext(contextOptions);

      // Crear una nueva página
      page = await browserContext.newPage();

      // Configurar timeouts
      page.setDefaultTimeout(options.timeout || 30000);

      // Implementar técnicas anti-detección si están habilitadas
      if (options.antiDetection?.enabled) {
        await this.applyAntiDetectionTechniques(page, options.antiDetection);
      }

      // Interceptar solicitudes si es necesario
      if (!options.loadImages) {
        await page.route('**/*.{png,jpg,jpeg,gif,webp,svg}', route => {
          // Abortar solicitudes de imágenes para mejorar rendimiento
          route.abort();
        });
      }

      // Navegar a la URL
      this.log(context, 'info', `Navegando a ${url}`);
      await page.goto(url, { waitUntil: 'domcontentloaded' });

      // Esperar a un selector específico si se solicita
      if (options.waitFor) {
        this.log(context, 'info', `Esperando a que aparezca el selector: ${options.waitFor}`);
        await page.waitForSelector(options.waitFor, { timeout: options.timeout || 30000 })
          .catch(() => {
            this.log(context, 'warning', `Timeout esperando al selector: ${options.waitFor}`);
          });
      }

      // Realizar acciones de clic si se especifican
      if (options.clicks && options.clicks.length > 0) {
        await this.performClicks(page, options.clicks, context);
      }

      // Completar formularios si se especifican
      if (options.formData && options.formData.length > 0) {
        await this.fillForms(page, options.formData, context);
      }

      // Extraer texto según selector o usar el texto de toda la página
      let text: string;
      let html: string;

      if (selector) {
        // Intentar extraer contenido del selector
        await page.waitForSelector(selector, { timeout: 5000 }).catch(() => {
          this.log(context, 'warning', `Selector ${selector} no encontrado, se usará el contenido completo`);
        });

        const elements = await page.$$(selector);
        if (elements.length > 0) {
          const texts = await Promise.all(
            elements.map(element => element.textContent())
          );
          text = texts.filter(Boolean).join('\n');
          html = await page.content();
        } else {
          // Si no hay elementos, extraer todo el texto
          text = await page.innerText('body');
          html = await page.content();
        }
      } else {
        // Sin selector, extraer todo el texto
        text = await page.innerText('body');
        html = await page.content();
      }

      // Tomar captura de pantalla si se solicita
      if (options.screenshot) {
        this.log(context, 'info', 'Tomando captura de pantalla');
        const buffer = await page.screenshot({ type: 'jpeg', quality: 80 });
        screenshot = buffer.toString('base64');
      }

      // Procesar el texto según opciones
      const processedText = this.processText(text, options);

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
        html: html.substring(0, 5000), // Versión corta del HTML original
        processedText,
        stats: {
          originalLength: text.length,
          processedLength: processedText.length,
          wordCount: processedText.split(/\s+/).filter(Boolean).length,
          executionTimeMs: executionTime,
          method: ScraperMethod.BROWSER,
          proxyUsed: options.proxy?.server || options.proxyRotation?.enabled ? 'yes' : 'no',
          antiDetectionUsed: options.antiDetection?.enabled ? 'yes' : 'no'
        },
        timestamp: new Date().toISOString(),
        screenshot: screenshot
      };

      return result;
    } catch (error) {
      // Registrar error
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log(context, 'error', `Error en scraping con navegador: ${errorMessage}`);

      // Intentar tomar captura de pantalla del error si hay página abierta
      if (page && options.screenshot) {
        try {
          const buffer = await page.screenshot({ type: 'jpeg', quality: 70 });
          screenshot = buffer.toString('base64');
        } catch (screenshotError) {
          this.log(context, 'warning', 'No se pudo tomar captura de pantalla del error');
        }
      }

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
          method: ScraperMethod.BROWSER,
          proxyUsed: options.proxy?.server || options.proxyRotation?.enabled ? 'yes' : 'no',
          antiDetectionUsed: options.antiDetection?.enabled ? 'yes' : 'no'
        },
        timestamp: new Date().toISOString(),
        screenshot: screenshot
      };
    } finally {
      // Cerrar página y navegador
      if (page) {
        await page.close();
      }
      if (browser) {
        await browser.close();
      }
      this.concurrentPages--;
    }
  }

  /**
   * Prepara las opciones para lanzar el navegador
   */
  private prepareBrowserOptions(options: ScraperOptions): any {
    const browserOptions: any = {
      headless: this.config.browser?.headless ?? true,
      timeout: this.config.browser?.timeout ?? 30000,
      args: this.config.browser?.args || ['--no-sandbox', '--disable-setuid-sandbox']
    };

    // Aplicar proxy si está especificado
    if (options.proxy) {
      browserOptions.proxy = options.proxy;
    }
    // O usar proxy rotation si está habilitada
    else if (options.proxyRotation?.enabled && options.proxyRotation.proxies.length > 0) {
      const proxies = options.proxyRotation.proxies;
      let proxyToUse: ProxySettings;

      // Seleccionar proxy según la estrategia
      if (options.proxyRotation.rotationStrategy === 'random') {
        // Estrategia aleatoria
        const randomIndex = Math.floor(Math.random() * proxies.length);
        proxyToUse = proxies[randomIndex];
      } else {
        // Estrategia round-robin (por defecto)
        proxyToUse = proxies[this.proxyIndex % proxies.length];
        this.proxyIndex++;
      }

      // Crear un contexto temporal para logging
      const tempContext: TaskContext = {
        id: 'system',
        attempt: 0,
        startedAt: new Date(),
        logs: []
      };

      this.log(tempContext, 'info', `Usando proxy: ${proxyToUse.server}`);

      browserOptions.proxy = proxyToUse;
    }

    return browserOptions;
  }

  /**
   * Prepara las opciones para el contexto del navegador
   */
  private prepareContextOptions(options: ScraperOptions): BrowserContextOptions {
    const contextOptions: any = {
      viewport: { width: 1366, height: 768 }
    };

    // Aplicar user agent personalizado o aleatorio si está configurado
    if (options.antiDetection?.enabled) {
      if (options.antiDetection.customUserAgent) {
        contextOptions.userAgent = options.antiDetection.customUserAgent;
      } else if (options.antiDetection.randomizeUserAgent) {
        contextOptions.userAgent = this.getRandomUserAgent();
      }
    } else if (options.userAgent) {
      contextOptions.userAgent = options.userAgent;
    }

    return contextOptions;
  }

  /**
   * Aplica técnicas anti-detección avanzadas
   */
  private async applyAntiDetectionTechniques(page: Page, settings: any): Promise<void> {
    // Ocultar WebDriver
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    // Simular plugins y fuentes
    if (settings.usePlugins) {
      await page.addInitScript(() => {
        // Simular plugins comunes del navegador
        Object.defineProperty(navigator, 'plugins', {
          get: () => {
            return [
              { name: 'Chrome PDF Plugin' },
              { name: 'Chrome PDF Viewer' },
              { name: 'Native Client' }
            ];
          }
        });

        // Simular mimetypes
        Object.defineProperty(navigator, 'mimeTypes', {
          get: () => {
            return [
              { type: 'application/pdf' },
              { type: 'application/x-google-chrome-pdf' }
            ];
          }
        });
      });
    }

    // Aplicar técnicas específicas según la configuración
    if (settings.evasionTechniques && settings.evasionTechniques.length > 0) {
      for (const technique of settings.evasionTechniques) {
        switch (technique) {
          case 'canvas-fingerprint':
            await page.addInitScript(() => {
              // Modificar canvas fingerprinting
              const originalGetImageData = HTMLCanvasElement.prototype.toDataURL;
              HTMLCanvasElement.prototype.toDataURL = function(type) {
                // Añadir ruido sutil a canvas data
                if (type === 'image/png' && this.width > 16 && this.height > 16) {
                  const context = this.getContext('2d');
                  if (context) {
                    const imageData = context.getImageData(0, 0, 2, 2);
                    imageData.data[0] = imageData.data[0] < 255 ? imageData.data[0] + 1 : imageData.data[0] - 1;
                    context.putImageData(imageData, 0, 0);
                  }
                }
                return originalGetImageData.apply(this, arguments);
              };
            });
            break;

          case 'timezone-mask':
            await page.addInitScript(() => {
              // Simular una zona horaria específica
              const dateProto = Date.prototype;
              const originalGetTimezoneOffset = dateProto.getTimezoneOffset;
              dateProto.getTimezoneOffset = function() {
                return -180; // Simular GMT+3
              };
            });
            break;

          case 'audio-fingerprint':
            await page.addInitScript(() => {
              // Modificar AudioContext fingerprinting
              if (typeof window.AudioContext !== 'undefined') {
                const originalCreateOscillator = AudioContext.prototype.createOscillator;
                AudioContext.prototype.createOscillator = function() {
                  const oscillator = originalCreateOscillator.apply(this, arguments);
                  oscillator.frequency.value = (oscillator.frequency.value * 1.00001) % 22050;
                  return oscillator;
                };
              }
            });
            break;

          default:
            // Técnica desconocida, ignorar
            break;
        }
      }
    }
  }

  /**
   * Genera un User-Agent aleatorio realista
   */
  private getRandomUserAgent(): string {
    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/95.0.4638.69 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.1 Safari/605.1.15',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.45 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.55 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.45 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; rv:91.0) Gecko/20100101 Firefox/91.0',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:94.0) Gecko/20100101 Firefox/94.0',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:94.0) Gecko/20100101 Firefox/94.0',
      'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:94.0) Gecko/20100101 Firefox/94.0'
    ];

    return userAgents[Math.floor(Math.random() * userAgents.length)];
  }

  /**
   * Realiza acciones de clic en elementos
   */
  private async performClicks(page: Page, clicks: ClickAction[], context: TaskContext): Promise<void> {
    for (const click of clicks) {
      try {
        this.log(context, 'info', `Realizando clic en selector: ${click.selector}`);

        // Esperar a que el elemento sea visible
        await page.waitForSelector(click.selector, { state: 'visible' });

        // Hacer clic
        await page.click(click.selector);

        // Esperar después del clic si se especifica
        if (click.waitAfter) {
          await page.waitForTimeout(click.waitAfter);
        }
      } catch (error) {
        this.log(context, 'warning', `Error en clic ${click.selector}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  /**
   * Completa formularios con los datos especificados
   */
  private async fillForms(page: Page, formData: FormDataEntry[], context: TaskContext): Promise<void> {
    for (const entry of formData) {
      try {
        this.log(context, 'info', `Completando campo ${entry.selector}`);

        // Esperar a que el campo sea visible
        await page.waitForSelector(entry.selector, { state: 'visible' });

        // Manejar diferentes tipos de campos
        switch (entry.type) {
          case 'checkbox':
            if (entry.value.toLowerCase() === 'true') {
              await page.check(entry.selector);
            } else {
              await page.uncheck(entry.selector);
            }
            break;

          case 'select':
            await page.selectOption(entry.selector, entry.value);
            break;

          case 'radio':
            await page.check(`${entry.selector}[value="${entry.value}"]`);
            break;

          case 'text':
          default:
            await page.fill(entry.selector, entry.value);
            break;
        }
      } catch (error) {
        this.log(context, 'warning', `Error al completar ${entry.selector}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  /**
   * Registra un mensaje de log en el contexto
   */
  private log(context: TaskContext, level: 'info' | 'warning' | 'error' | 'debug', message: string): void {
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
