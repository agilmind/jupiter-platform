import { GeneratorOptions } from '../../types';

export function postgresService(options: GeneratorOptions): string {
  return `  postgres:
    image: postgres:14-alpine
    environment:
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=postgres
      - POSTGRES_DB=${options.projectName}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5433:5432"  # Cambiado a 5433 para evitar conflictos
    networks:
      - app-network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"`;
}
