import { WorkerTask, WorkerConfig } from '@jupiter/worker-framework';

/**
 * Método de scraping a utilizar
 */
export enum ScraperMethod {
  AUTO = 'auto',
  BROWSER = 'browser',
  LIGHT = 'light'
}

/**
 * Configuración de proxy
 */
export interface ProxySettings {
  server: string;
  username?: string;
  password?: string;
}

/**
 * Configuración del worker de scraping
 */
export interface ScraperWorkerConfig extends WorkerConfig {
  browser?: BrowserConfig;
  scraper?: ScraperConfig;
}

/**
 * Tarea de scraping
 */
export interface ScraperTask extends WorkerTask {
  url?: string;
  selector?: string;
  data?: {
    url?: string;
    text?: string;
    options?: ScraperOptions;
    [key: string]: any;
  };
}

/**
 * Configuración del navegador
 */
export interface BrowserConfig {
  headless: boolean;
  timeout: number;
  args?: string[];
}

/**
 * Configuración específica para scrapers
 */
export interface ScraperConfig {
  maxConcurrentBrowsers: number;
  defaultMethod: ScraperMethod;
  userAgent?: string;
}

/**
 * Opciones para el scraping
 */
export interface ScraperOptions {
  method?: ScraperMethod;
  waitFor?: string;
  timeout?: number;
  removeHtml?: boolean;
  maxLength?: number;
  keywords?: string[];
  formData?: FormDataEntry[];
  clicks?: ClickAction[];
  screenshot?: boolean;
  proxy?: ProxySettings;
  proxyRotation?: ProxyRotationSettings;
  antiDetection?: AntiDetectionSettings;
  userAgent?: string;
  loadImages?: boolean; // Flag para controlar si se cargan imágenes
}
/**
 * Acción de completar un formulario
 */
export interface FormDataEntry {
  selector: string;
  value: string;
  type?: 'text' | 'select' | 'checkbox' | 'radio';
}

/**
 * Acción de clic
 */
export interface ClickAction {
  selector: string;
  waitAfter?: number;
}

/**
 * Interfaz específica para tareas de scraping
 */
export interface ScraperTask extends WorkerTask {
  url?: string;
  selector?: string;
  data?: {
    url?: string;
    text?: string;
    options?: ScraperOptions;
    [key: string]: any;
  };
}

/**
 * Estadísticas del resultado
 */
export interface ScraperStats {
  originalLength?: number;
  processedLength?: number;
  wordCount?: number;
  executionTimeMs?: number;
  method?: ScraperMethod;
  [key: string]: any;
}

/**
 * Interfaz para resultados de scraping
 */
export interface ScraperResult {
  id: string;
  url?: string;
  data?: any;
  text: string;
  html?: string;
  processedText?: string;
  extractedData?: any;
  stats?: ScraperStats;
  timestamp: string;
  error?: string;
  screenshot?: string; // Base64
}

/**
 * Configuración de proxy
 */
export interface ProxySettings {
  server: string;
  username?: string;
  password?: string;
}

/**
 * Configuración para rotación de proxies
 */
export interface ProxyRotationSettings {
  enabled: boolean;
  proxies: ProxySettings[];
  rotationInterval?: number; // Milisegundos entre rotaciones
  rotationStrategy?: 'round-robin' | 'random';
}

/**
 * Configuración de técnicas anti-detección
 */
export interface AntiDetectionSettings {
  enabled: boolean;
  randomizeUserAgent?: boolean;
  usePlugins?: boolean;
  evasionTechniques?: string[]; // Técnicas específicas a utilizar ('canvas-fingerprint', 'timezone-mask', etc.)
  customUserAgent?: string;
}

/**
 * Opciones del contexto del navegador
 */
export interface BrowserContextOptions {
  viewport?: { width: number; height: number };
  userAgent?: string;
  // Otras opciones que Playwright soporta
}
