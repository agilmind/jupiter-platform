import { RetryConfig } from './interfaces';
import { createLogger } from './utils/logger';

const logger = createLogger('retry-manager');

/**
 * Gestiona la lógica de reintentos con backoff exponencial
 */
export class RetryManager {
  private config: RetryConfig & {
    jitterFactor: number;  // Extensión de RetryConfig
  };

  constructor(config: RetryConfig) {
    this.config = {
      ...config,
      jitterFactor: 0.1 // 10% de jitter por defecto
    };

    logger.debug('RetryManager initialized', { config: this.config });
  }

  /**
   * Calcula el delay para un reintento específico
   * Implementa backoff exponencial con jitter
   *
   * @param retryCount El número de reintentos realizados hasta ahora
   * @returns El tiempo en ms para esperar antes del siguiente reintento
   */
  getRetryDelay(retryCount: number): number {
    // Backoff exponencial base
    const baseDelay = this.config.initialDelay * Math.pow(this.config.backoffFactor, retryCount);

    // Aplicar límite máximo
    const cappedDelay = Math.min(baseDelay, this.config.maxDelay);

    // Aplicar jitter aleatorio para evitar tormentas de reconexión
    const jitterRange = cappedDelay * this.config.jitterFactor!;
    const jitter = Math.random() * jitterRange * 2 - jitterRange; // -jitterRange a +jitterRange

    const finalDelay = Math.max(0, cappedDelay + jitter);

    logger.debug(`Calculated retry delay for attempt ${retryCount + 1}`, {
      baseDelay,
      cappedDelay,
      jitter,
      finalDelay
    });

    return finalDelay;
  }

  /**
   * Verifica si se debe continuar reintentando
   *
   * @param retryCount Número actual de reintentos
   * @returns true si se debe reintentar, false en caso contrario
   */
  shouldRetry(retryCount: number): boolean {
    return retryCount < this.config.maxRetries;
  }
}
