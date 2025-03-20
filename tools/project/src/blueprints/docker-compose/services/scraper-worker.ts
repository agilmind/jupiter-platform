import { GeneratorOptions } from '../../types';

export function scraperWorkerService(options: GeneratorOptions): string {
  return `  scraper-worker:
    build:
      context: ./scraper-worker
      dockerfile: Dockerfile
    environment:
      - NODE_ENV=development
      - RABBITMQ_URL=amqp://guest:guest@rabbitmq:5672
      - SCRAPER_QUEUE=scraper_tasks
      - SCRAPER_RETRY_QUEUE=scraper_retry
      - SCRAPER_DLQ=scraper_dlq
      - RESULT_QUEUE=result_queue
      - PREFETCH=1
      - MAX_RETRIES=3
      - BACKOFF_MULTIPLIER=2000
      - GRAPHQL_URL=http://app-server:3000/graphql
      - DEBUG=true
    volumes:
      - ./scraper-worker/src:/app/src
      - ./scraper-worker/tsconfig.json:/app/tsconfig.json
    networks:
      - app-network
    depends_on:
      - rabbitmq
    logging:
      driver: 'json-file'
      options:
        max-size: '10m'
        max-file: '3'
    restart: unless-stopped
`;
}
