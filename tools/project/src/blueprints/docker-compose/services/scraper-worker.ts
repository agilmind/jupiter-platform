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
      - PREFETCH=1
      - MAX_RETRIES=3
      - BACKOFF_MULTIPLIER=2000
      - GRAPHQL_URL=http://app-server:3000/graphql
    volumes:
      - ./scraper-worker:/app
      - /app/node_modules
    depends_on:
      - rabbitmq
      - app-server
    networks:
      - app-network
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
`;
}
