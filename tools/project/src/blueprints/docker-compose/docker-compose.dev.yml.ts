import { GeneratorOptions } from '../types';

export function dockerComposeDev(options: GeneratorOptions): string {
  const { projectName } = options;

  return `
services:
  app-server:
    build:
      context: ./app-server
      dockerfile: Dockerfile.dev
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=development
      - PORT=3000
    volumes:
      - ./app-server:/app
      - /app/node_modules
    networks:
      - app-network
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  web-app:
    build:
      context: ./web-app
      dockerfile: Dockerfile
    ports:
      - "8080:80"
    volumes:
      - ./web-app/src:/usr/share/nginx/html
      - ./web-app/nginx.conf:/etc/nginx/conf.d/default.conf
    depends_on:
      - app-server
    networks:
      - app-network
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

networks:
  app-network:
    name: ${projectName}-network`;
}
