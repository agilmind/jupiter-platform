import { Page, Browser } from 'playwright';
import { TaskContext } from '@jupiter/worker-framework';
import { WorkerTask, TaskResult, WorkerConfig } from '@jupiter/worker-framework';

export interface ScraperTask extends WorkerTask {
  url?: string;
  selector?: string;
  data?: {
    url?: string;
    options?: ScraperOptions;
  };
}

export interface ScraperResult extends TaskResult {
  id: string;
  url: string;
  data?: any;
  text: string;
  html?: string;
  processedText?: string;
  error?: string;
  stats?: {
    originalLength?: number;
    processedLength?: number;
    wordCount?: number;
    executionTimeMs: number;
    method: ScraperMethod;
    proxyUsed?: string;
    antiDetectionUsed?: string;
    keywordsFound?: string[];
  };
  timestamp: string;
  screenshot?: string;
}

export enum ScraperMethod {
  AUTO = 'auto',
  BROWSER = 'browser',
  LIGHT = 'light'
}

export interface ScraperOptions {
  method?: ScraperMethod;
  timeout?: number;
  removeHtml?: boolean;
  maxLength?: number;
  userAgent?: string;
  formData?: FormDataEntry[];
  clicks?: ClickAction[];
  waitFor?: string;
  loadImages?: boolean;
  screenshot?: boolean;
  keywords?: string[];
  proxy?: ProxySettings;
  proxyRotation?: {
    enabled: boolean;
    proxies: ProxySettings[];
    rotationStrategy?: 'round-robin' | 'random';
  };
  antiDetection?: {
    enabled: boolean;
    customUserAgent?: string;
    randomizeUserAgent?: boolean;
    usePlugins?: boolean;
    evasionTechniques?: string[];
  };
}

export interface ProxySettings {
  server: string;
  username?: string;
  password?: string;
}

export interface BrowserContextOptions {
  viewport?: {
    width: number;
    height: number;
  };
  userAgent?: string;
}

export interface FormDataEntry {
  selector: string;
  value: string;
  type?: 'text' | 'checkbox' | 'select' | 'radio';
}

export interface ClickAction {
  selector: string;
  waitAfter?: number;
}

export interface ScraperWorkerConfig extends WorkerConfig {
  scraper?: {
    defaultMethod?: ScraperMethod;
    maxConcurrentBrowsers?: number;
    userAgent?: string;
  };
  browser?: {
    headless?: boolean;
    timeout?: number;
    args?: string[];
  };
}

/**
 * Interfaz para cualquier servicio de scraping
 */
export interface Scraper {
  /**
   * Inicializa recursos necesarios
   */
  initialize(): Promise<void>;

  /**
   * Limpia recursos
   */
  cleanup(): Promise<void>;

  /**
   * Comprueba si este scraper puede manejar la tarea
   */
  canHandle(task: ScraperTask): boolean;

  /**
   * Ejecuta el scraping
   */
  execute(task: ScraperTask, context: TaskContext): Promise<ScraperResult>;
}

/**
 * Interfaz para proveedores de navegadores
 */
export interface BrowserProvider {
  /**
   * Inicializa el navegador
   */
  initialize(): Promise<void>;

  /**
   * Limpia recursos
   */
  cleanup(): Promise<void>;

  /**
   * Crea una nueva instancia de navegador
   */
  createBrowser(options?: any): Promise<Browser>;

  /**
   * Crea una nueva página
   */
  createPage(browser: Browser, options?: BrowserContextOptions): Promise<Page>;

  /**
   * Aplica técnicas anti-detección
   */
  applyAntiDetection(page: Page, settings: any): Promise<void>;
}

/**
 * Interfaz para procesadores de texto
 */
export interface TextProcessor {
  /**
   * Procesa el texto extraído según opciones
   */
  processText(text: string, options?: ScraperOptions): string;
}

/**
 * Interfaz para extractores de contenido
 */
export interface ContentExtractor {
  /**
   * Extrae contenido desde HTML según selector
   */
  extract(html: string, selector?: string): { text: string, extractedHtml: string };
}

/**
 * Interfaz para interacciones de página
 */
export interface PageInteractor {
  /**
   * Realiza clics en elementos
   */
  performClicks(page: Page, clicks: ClickAction[], context: TaskContext): Promise<void>;

  /**
   * Completa formularios
   */
  fillForms(page: Page, formData: FormDataEntry[], context: TaskContext): Promise<void>;
}

/**
 * Interfaz para gestión de proxies
 */
export interface ProxyManager {
  /**
   * Obtiene un proxy según la configuración
   */
  getProxy(options: ScraperOptions): ProxySettings | null;

  /**
   * Registra uso de proxy
   */
  logProxyUse(proxy: ProxySettings, context: TaskContext): void;
}
