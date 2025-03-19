import { GeneratorOptions } from '../../types';

export function webAppService(options: GeneratorOptions): string {
  return `  web-app:
    build:
      context: ./web-app
      dockerfile: Dockerfile
    ports:
      - "8080:80"
    volumes:
      - ./web-app/src:/usr/share/nginx/html
      - ./web-app/nginx.conf:/etc/nginx/conf.d/default.conf
    ${options.includeApolloPrisma ? 'depends_on:\n      - app-server' : ''}
    networks:
      - app-network
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"`;
}
