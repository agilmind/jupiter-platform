import { TextScraper } from './text-scraper';
import { ScraperMethod } from './types';

async function bootstrap() {
  console.log('Iniciando Scraper Worker...');

  try {
    // Configuración desde variables de entorno
    const workerConfig = {
      queue: {
        url: process.env.RABBITMQ_URL || 'amqp://guest:guest@rabbitmq:5672',
        mainQueue: process.env.SCRAPER_QUEUE || 'scraper_tasks',
        retryQueue: process.env.SCRAPER_RETRY_QUEUE || 'scraper_retry',
        deadLetterQueue: process.env.SCRAPER_DLQ || 'scraper_dlq',
        resultQueue: process.env.RESULT_QUEUE || 'result_queue',
        prefetch: parseInt(process.env.PREFETCH || '1', 10),
      },
      retry: {
        maxRetries: parseInt(process.env.MAX_RETRIES || '3', 10),
        backoffMultiplier: parseInt(
          process.env.BACKOFF_MULTIPLIER || '2000',
          10
        ),
      },
      graphql: {
        url: process.env.GRAPHQL_URL || 'http://app-server:3000/graphql',
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

    // Crear instancia del scraper con la configuración
    const scraperWorker = new TextScraper(workerConfig);

    // Iniciar el scraper (esto iniciará la conexión a RabbitMQ y empezará a consumir mensajes)
    await scraperWorker.start();

    console.log('Scraper Worker iniciado correctamente');

    // Manejo adecuado de señales para cerrar recursos correctamente
    process.on('SIGTERM', async () => {
      console.log('Recibida señal SIGTERM');
      await scraperWorker.shutdown();
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      console.log('Recibida señal SIGINT');
      await scraperWorker.shutdown();
      process.exit(0);
    });

    // Manejar excepciones no capturadas
    process.on('uncaughtException', async (error) => {
      console.error('Excepción no capturada:', error);
      try {
        await scraperWorker.shutdown();
      } catch (shutdownError) {
        console.error('Error al detener el worker:', shutdownError);
      }
      process.exit(1);
    });

    // Manejar rechazos de promesas no capturados
    process.on('unhandledRejection', async (reason) => {
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
