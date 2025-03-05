import { EmailWorker, EmailWorkerConfig } from './app/email.worker';
import { createLogger } from '@jupiter/worker-framework';

const logger = createLogger('email-service');

// Leer la configuración del entorno
const config: EmailWorkerConfig = {
  queue: {
    host: process.env['RABBITMQ_HOST'] || 'localhost',
    port: parseInt(process.env['RABBITMQ_PORT'] || '5672', 10),
    user: process.env['RABBITMQ_USER'] || 'guest',
    password: process.env['RABBITMQ_PASSWORD'] || 'guest',
    mainQueue: process.env['EMAIL_QUEUE'] || 'emails',
    retryQueue: process.env['EMAIL_RETRY_QUEUE'] || 'email-retry',
    deadLetterQueue: process.env['EMAIL_DEAD_LETTER_QUEUE'] || 'email-dlq',
    prefetch: parseInt(process.env['EMAIL_PREFETCH'] || '5', 10)
  },
  retry: {
    maxRetries: parseInt(process.env['EMAIL_MAX_RETRIES'] || '5', 10),
    initialDelayMs: parseInt(process.env['EMAIL_INITIAL_RETRY_DELAY'] || '60000', 10),
    backoffFactor: parseFloat(process.env['EMAIL_BACKOFF_FACTOR'] || '2'),
    maxDelayMs: parseInt(process.env['EMAIL_MAX_RETRY_DELAY'] || '3600000', 10)
  },
  graphql: {
    endpoint: process.env['GRAPHQL_ENDPOINT'] || 'http://localhost:4000/graphql',
    apiKey: process.env['GRAPHQL_API_KEY'] || 'default-api-key'
  },
  email: {
    host: process.env['EMAIL_HOST'] || 'smtp.gmail.com',
    port: parseInt(process.env['EMAIL_PORT'] || '587', 10),
    secure: process.env['EMAIL_SECURE'] === 'true',
    user: process.env['EMAIL_USER'] || '',
    password: process.env['EMAIL_PASSWORD'] || '',
    from: process.env['EMAIL_FROM'] || 'noreply@example.com',
    rateLimit: {
      minIntervalMs: parseInt(process.env['EMAIL_RATE_LIMIT'] || '1000', 10),
      maxPerMinute: parseInt(process.env['EMAIL_MAX_PER_MINUTE'] || '20', 10)
    }
  }
};

// Iniciar el worker
const emailWorker = new EmailWorker(config);
emailWorker.start()
  .catch(error => {
    logger.error('Fatal error starting email worker', { 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    process.exit(1);
  });
