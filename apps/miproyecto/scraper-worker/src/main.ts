import { ScraperWorker } from './scraper.worker';

async function bootstrap() {
  console.log('Iniciando Scraper Worker...');

  try {
    const workerConfig = {
      queue: {
        url: process.env.RABBITMQ_URL || 'amqp://guest:guest@rabbitmq:5672',
        mainQueue: process.env.SCRAPER_QUEUE || 'scraper_tasks',
        retryQueue: process.env.SCRAPER_RETRY_QUEUE || 'scraper_retry',
        deadLetterQueue: process.env.SCRAPER_DLQ || 'scraper_dlq',
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
    };

    const scraperWorker = new ScraperWorker(workerConfig);
    await scraperWorker.start();

    console.log('Scraper Worker iniciado correctamente');

    // Manejo de señales de cierre
    process.on('SIGTERM', async () => {
      console.log('Recibida señal SIGTERM');
      // Eliminar la llamada a stop() que causa el error
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      console.log('Recibida señal SIGINT');
      // Eliminar la llamada a stop() que causa el error
      process.exit(0);
    });
  } catch (error) {
    console.error('Error iniciando Scraper Worker:', error);
    process.exit(1);
  }
}

bootstrap();
