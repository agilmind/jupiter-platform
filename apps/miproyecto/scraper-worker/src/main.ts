import {
  ConsoleLogger,
  DefaultQueueService,
  DefaultProgressReporter,
  ExponentialBackoffStrategy,
  WorkerManager
} from '@jupiter/worker-framework';

// Importar desde worker-scraper
import {
  ScraperMethod,
  ScraperWorkerConfig
} from '@jupiter/worker-scraper';

// Importar implementaciones específicas
import {
  PlaywrightBrowserProvider,
  DefaultTextProcessor,
  CheerioContentExtractor,
  PlaywrightPageInteractor,
  RotatingProxyManager,
  BrowserScraper,
  LightScraper,
  TextScraperHandler
} from '@jupiter/worker-scraper';

async function bootstrap() {
  console.log('Iniciando Scraper Worker...');

  try {
    // Configuración desde variables de entorno
    const config: ScraperWorkerConfig = {
      queue: {
        connectionUrl: process.env.RABBITMQ_URL || 'amqp://guest:guest@rabbitmq:5672',
        mainQueue: process.env.SCRAPER_QUEUE || 'scraper_tasks',
        retryQueue: process.env.SCRAPER_RETRY_QUEUE || 'scraper_retry',
        deadLetterQueue: process.env.SCRAPER_DLQ || 'scraper_dlq',
        prefetchCount: parseInt(process.env.PREFETCH || '1', 10),
        // Propiedad adicional para cola de resultados
        resultQueue: process.env.RESULT_QUEUE || 'result_queue'
      },
      retry: {
        maxRetries: parseInt(process.env.MAX_RETRIES || '3', 10),
        initialDelay: parseInt(process.env.INITIAL_DELAY || '1000', 10),
        backoffFactor: parseFloat(process.env.BACKOFF_FACTOR || '2'),
        maxDelay: parseInt(process.env.MAX_DELAY || '60000', 10)
      },
      graphql: {
        endpoint: process.env.GRAPHQL_URL || 'http://app-server:3000/graphql',
        apiKey: process.env.GRAPHQL_API_KEY
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
    logger.info('Inicializando componentes...');

    // Crear servicios del framework
    const queueService = new DefaultQueueService(config.queue, logger);
    const progressReporter = new DefaultProgressReporter(config.graphql, logger);
    const retryStrategy = new ExponentialBackoffStrategy(config.retry);

    // Crear componentes compartidos
    const textProcessor = new DefaultTextProcessor();
    const contentExtractor = new CheerioContentExtractor();
    const proxyManager = new RotatingProxyManager(logger);

    // Crear componentes para browser scraper
    const browserProvider = new PlaywrightBrowserProvider(config, logger);
    const pageInteractor = new PlaywrightPageInteractor(logger);

    // Crear los scrapers
    logger.info('Inicializando scrapers...');

    // Repositorio para guardar los scrapers activos
    const activeScrapers = [];

    // Inicializar browser scraper
    try {
      const browserScraper = new BrowserScraper(
        browserProvider,
        textProcessor,
        pageInteractor,
        proxyManager,
        config,
        logger
      );

      await browserScraper.initialize();
      logger.info('Browser scraper inicializado correctamente');
      activeScrapers.push(browserScraper);
    } catch (error) {
      logger.warn('Error inicializando Browser Scraper. Funcionalidades avanzadas no disponibles:', {
        error: error instanceof Error ? error.message : String(error)
      });
    }

    // Inicializar light scraper
    try {
      const lightScraper = new LightScraper(
        textProcessor,
        contentExtractor,
        config,
        logger
      );

      await lightScraper.initialize();
      logger.info('Light scraper inicializado correctamente');
      activeScrapers.push(lightScraper);
    } catch (error) {
      logger.warn('Error inicializando Light Scraper:', {
        error: error instanceof Error ? error.message : String(error)
      });
    }

    // Verificar que al menos un scraper esté activo
    if (activeScrapers.length === 0) {
      throw new Error('No se pudo inicializar ningún scraper. El worker no puede arrancar.');
    }

    // Crear el manejador de tareas
    const taskHandler = new TextScraperHandler(
      activeScrapers,
      config,
      logger
    );

    // Inicializar el handler (para configurar la cola de resultados)
    await taskHandler.initialize();
    logger.info('Task handler inicializado');

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
    logger.info('Scraper Worker iniciado correctamente');

    // Manejo adecuado de señales para cerrar recursos correctamente
    const shutdown = async (signal: string) => {
      logger.info(`Recibida señal ${signal}, cerrando recursos...`);

      try {
        // Cerrar handler específico primero
        await taskHandler.shutdown();
        logger.info('Handler cerrado');

        // Luego cerrar el worker manager
        await workerManager.shutdown();
        logger.info('Worker manager cerrado');

        // Finalmente cerrar los scrapers
        const cleanupPromises = activeScrapers.map(scraper =>
          scraper.cleanup().catch(error => {
            logger.error(`Error al limpiar scraper ${scraper.constructor.name}:`, {
              error: error instanceof Error ? error.message : String(error)
            });
          })
        );

        await Promise.allSettled(cleanupPromises);
        logger.info('Scrapers cerrados');

        logger.info('Recursos cerrados correctamente');
        process.exit(0);
      } catch (error) {
        logger.error('Error durante el apagado:', {
          error: error instanceof Error ? error.message : String(error)
        });
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Manejar excepciones no capturadas
    process.on('uncaughtException', async (error) => {
      logger.error('Excepción no capturada:', {
        error: error.message,
        stack: error.stack
      });
      await shutdown('uncaughtException');
    });

    // Manejar rechazos de promesas no capturados
    process.on('unhandledRejection', (reason) => {
      logger.error('Rechazo de promesa no manejado:', {
        reason: reason instanceof Error ? reason.message : String(reason)
      });
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
      console.error(`Reintentando iniciar el worker en ${delay/1000} segundos...`, error);
      setTimeout(startWithRetry, delay);
    } else {
      console.error(`No se pudo iniciar el worker después de ${maxRetries} intentos. Saliendo.`, error);
      process.exit(1);
    }
  }
}

startWithRetry();
