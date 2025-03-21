import { ScraperMethod, ScraperWorkerConfig } from './scraper-interfaces';
import {
  ConsoleLogger,
  DefaultQueueService,
  DefaultProgressReporter,
  ExponentialBackoffStrategy,
  WorkerManager
} from '@jupiter/worker-framework';

// Importar implementaciones basadas en composición
import {
  PlaywrightBrowserProvider,
  DefaultTextProcessor,
  CheerioContentExtractor,
  PlaywrightPageInteractor,
  RotatingProxyManager,
  BrowserScraper,
  LightScraper
} from '../../../../libs/worker-scraper/src/lib/implementations';

import { TextScraperHandler } from '../../../../libs/worker-scraper/src/lib/text-scraper-handler';

async function bootstrap() {
  console.log('Iniciando Scraper Worker...');

  try {
    // Configuración desde variables de entorno (adaptada a la nueva estructura)
    const config: ScraperWorkerConfig = {
      queue: {
        connectionUrl: process.env.RABBITMQ_URL || 'amqp://guest:guest@rabbitmq:5672',
        mainQueue: process.env.SCRAPER_QUEUE || 'scraper_tasks',
        retryQueue: process.env.SCRAPER_RETRY_QUEUE || 'scraper_retry',
        deadLetterQueue: process.env.SCRAPER_DLQ || 'scraper_dlq',
        prefetchCount: parseInt(process.env.PREFETCH || '1', 10),
        // Propiedades adicionales para mantener compatibilidad
        resultQueue: process.env.RESULT_QUEUE || 'result_queue'
      },
      retry: {
        maxRetries: parseInt(process.env.MAX_RETRIES || '3', 10),
        initialDelay: parseInt(process.env.INITIAL_DELAY || '1000', 10),
        backoffFactor: parseInt(process.env.BACKOFF_FACTOR || '2', 10),
        maxDelay: parseInt(process.env.MAX_DELAY || '60000', 10)
      },
      graphql: {
        endpoint: process.env.GRAPHQL_URL || 'http://app-server:3000/graphql'
      },
      // Opciones para el navegador Playwright
      browser: {
        headless: process.env.BROWSER_HEADLESS !== 'false',
        timeout: parseInt(process.env.BROWSER_TIMEOUT || '30000', 10),
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
        ]
      },
      // Opciones específicas para el scraper
      scraper: {
        maxConcurrentBrowsers: parseInt(process.env.MAX_CONCURRENT_BROWSERS || '3', 10),
        defaultMethod: (process.env.DEFAULT_SCRAPER_METHOD as ScraperMethod) || ScraperMethod.AUTO,
        userAgent: process.env.USER_AGENT || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    };

    // Crear logger
    const logger = new ConsoleLogger('scraper-worker');

    // Crear componentes compartidos
    const textProcessor = new DefaultTextProcessor();
    const contentExtractor = new CheerioContentExtractor();
    const proxyManager = new RotatingProxyManager(logger);

    // Crear componentes para browser scraper
    const browserProvider = new PlaywrightBrowserProvider(config, logger);
    const pageInteractor = new PlaywrightPageInteractor(logger);

    // Crear los scrapers
    const browserScraper = new BrowserScraper(
      browserProvider,
      textProcessor,
      pageInteractor,
      proxyManager,
      config,
      logger
    );

    const lightScraper = new LightScraper(
      textProcessor,
      contentExtractor,
      config,
      logger
    );

    // Inicializar los scrapers
    logger.info('Inicializando scrapers...');

    try {
      await browserScraper.initialize();
      logger.info('Browser scraper inicializado correctamente');
    } catch (error) {
      logger.warn('Error inicializando Browser Scraper. Funcionalidades avanzadas no disponibles:', {
        error: error instanceof Error ? error.message : String(error)
      });
    }

    try {
      await lightScraper.initialize();
      logger.info('Light scraper inicializado correctamente');
    } catch (error) {
      logger.warn('Error inicializando Light Scraper:', {
        error: error instanceof Error ? error.message : String(error)
      });
    }

    // Crear el manejador de tareas
    const taskHandler = new TextScraperHandler(
      [browserScraper, lightScraper].filter(Boolean), // Filtrar por si alguno falló
      config,
      logger
    );

    // Inicializar el handler (para configurar la cola de resultados)
    await taskHandler.initialize();

    // Crear los servicios del framework
    const queueService = new DefaultQueueService(config.queue, logger);
    const progressReporter = new DefaultProgressReporter(config.graphql, logger);
    const retryStrategy = new ExponentialBackoffStrategy(config.retry);

    // Crear worker manager
    const workerManager = new WorkerManager(
      taskHandler,
      queueService,
      progressReporter,
      retryStrategy,
      logger
    );

    // Iniciar el worker
    await workerManager.start();

    console.log('Scraper Worker iniciado correctamente');

    // Manejo adecuado de señales para cerrar recursos correctamente
    const shutdown = async (signal: string) => {
      console.log(`Recibida señal ${signal}, cerrando recursos...`);

      try {
        // Cerrar handler específico primero
        await taskHandler.shutdown();

        // Luego cerrar el worker manager
        await workerManager.shutdown();

        // Finalmente cerrar los scrapers
        await Promise.allSettled([
          browserScraper.cleanup(),
          lightScraper.cleanup()
        ]);

        console.log('Recursos cerrados correctamente');
        process.exit(0);
      } catch (error) {
        console.error('Error durante el apagado:', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Manejar excepciones no capturadas
    process.on('uncaughtException', async (error) => {
      console.error('Excepción no capturada:', error);
      await shutdown('uncaughtException');
    });

    // Manejar rechazos de promesas no capturados
    process.on('unhandledRejection', (reason) => {
      console.error('Rechazo de promesa no manejado:', reason);
      // No cerramos el worker aquí para permitir que continúe funcionando
    });
  } catch (error) {
    console.error('Error iniciando Scraper Worker:', error);
    process.exit(1);
  }
}

// Ejecutar la aplicación con reintentos
let retries = 0;
const maxRetries = 5;

async function startWithRetry() {
  try {
    await bootstrap();
  } catch (error) {
    retries++;
    if (retries < maxRetries) {
      const delay = 5000 * retries; // Retraso exponencial
      console.error(`Reintentando iniciar el worker en ${delay/1000} segundos...`);
      setTimeout(startWithRetry, delay);
    } else {
      console.error(`No se pudo iniciar el worker después de ${maxRetries} intentos. Saliendo.`);
      process.exit(1);
    }
  }
}

startWithRetry();
