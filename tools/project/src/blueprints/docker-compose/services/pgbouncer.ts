import { GeneratorOptions } from '../../types';

export function pgbouncerService(options: GeneratorOptions): string {
  return `  pgbouncer:
    image: edoburu/pgbouncer:1.18.0
    environment:
      - DB_USER=postgres
      - DB_PASSWORD=postgres
      - DB_HOST=postgres
      - DB_NAME=${options.projectName}
      - POOL_MODE=transaction
      - MAX_CLIENT_CONN=100
      - DEFAULT_POOL_SIZE=20
      - ADMIN_USERS=postgres
    ports:
      - "6432:6432"
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - app-network
    healthcheck:
      test: ["CMD", "bash", "-c", "printf \\\"SHOW LISTS\\\\n\\\" | nc localhost 6432"]
      interval: 10s
      timeout: 5s
      retries: 3
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"`;
}
