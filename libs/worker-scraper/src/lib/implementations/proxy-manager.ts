import { ProxyManager, ProxySettings, ScraperOptions } from '../scraper-interfaces';
import {Logger, TaskContext} from '@jupiter/worker-framework';


export class RotatingProxyManager implements ProxyManager {
  private proxyIndex: number = 0;
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  getProxy(options: ScraperOptions): ProxySettings | null {
    // Si hay un proxy específico, usarlo
    if (options.proxy) {
      return options.proxy;
    }

    // Si hay rotación de proxies habilitada, seleccionar uno
    if (options.proxyRotation?.enabled && options.proxyRotation.proxies.length > 0) {
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

      return proxyToUse;
    }

    // Si no hay proxy configurado
    return null;
  }

  logProxyUse(proxy: ProxySettings, context: TaskContext): void {
    if (!proxy) return;

    context.logs.push({
      timestamp: new Date(),
      level: 'info',
      message: `Using proxy: ${proxy.server}`
    });

    this.logger.info(`Using proxy: ${proxy.server}`);
  }
}
