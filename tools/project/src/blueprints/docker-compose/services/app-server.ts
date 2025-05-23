import { GeneratorOptions } from '../../types';

export function appServerService(options: GeneratorOptions): string {
  return `  app-server:
    build:
      context: ./app-server
      dockerfile: Dockerfile.dev
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=development
      - PORT=3000
      - DATABASE_URL=postgresql://postgres:postgres@postgres:5432/${options.projectName}
    volumes:
      - ./app-server:/app
      - /app/node_modules
    networks:
      - app-network
    depends_on:
      - postgres
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"`;
}
