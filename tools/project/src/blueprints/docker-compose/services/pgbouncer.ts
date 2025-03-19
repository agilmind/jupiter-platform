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
    ports:
      - "6432:6432"
    depends_on:
      - postgres
    networks:
      - app-network
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"`;
}
