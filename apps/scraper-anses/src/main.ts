import { ScraperAnsesWorker, ScraperAnsesWorkerConfig } from './app/scraper-anses.worker';
import { createLogger } from '@jupiter/worker-framework';

const logger = createLogger('scraper-anses-service');

// Leer la configuración del entorno
const config: ScraperAnsesWorkerConfig = {
  queue: {
    host: process.env['RABBITMQ_HOST'] || 'localhost',
    port: parseInt(process.env['RABBITMQ_PORT'] || '5672', 10),
    user: process.env['RABBITMQ_USER'] || 'guest',
    password: process.env['RABBITMQ_PASSWORD'] || 'guest',
    mainQueue: process.env['SCRAPER_ANSES_QUEUE'] || 'scraper-anses',
    retryQueue: process.env['SCRAPER_ANSES_RETRY_QUEUE'] || 'scraper-anses-retry',
    deadLetterQueue: process.env['SCRAPER_ANSES_DEAD_LETTER_QUEUE'] || 'scraper-anses-dlq',
    prefetch: parseInt(process.env['SCRAPER_ANSES_PREFETCH'] || '5', 10)
  },
  retry: {
    maxRetries: parseInt(process.env['SCRAPER_ANSES_MAX_RETRIES'] || '5', 10),
    initialDelayMs: parseInt(process.env['SCRAPER_ANSES_INITIAL_RETRY_DELAY'] || '60000', 10),
    backoffFactor: parseFloat(process.env['SCRAPER_ANSES_BACKOFF_FACTOR'] || '2'),
    maxDelayMs: parseInt(process.env['SCRAPER_ANSES_MAX_RETRY_DELAY'] || '3600000', 10)
  },
  graphql: {
    endpoint: process.env['GRAPHQL_ENDPOINT'] || 'http://localhost:4000/graphql',
    apiKey: process.env['GRAPHQL_API_KEY'] || 'default-api-key'
  },
  scraper: {
    // Configuración específica para este worker
    // Ejemplo:
    timeout: parseInt(process.env['SCRAPER_ANSES_TIMEOUT'] || '30000', 10),
    maxConcurrency: parseInt(process.env['SCRAPER_ANSES_MAX_CONCURRENCY'] || '1', 10)
  }
};

// Iniciar el worker
const scraperAnsesWorker = new ScraperAnsesWorker(config);
scraperAnsesWorker.start()
  .catch(error => {
    logger.error('Fatal error starting scraper-anses worker', { 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    process.exit(1);
  });
