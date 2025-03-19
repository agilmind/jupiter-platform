import { GeneratorOptions } from '../types';

export function packageJson(options: GeneratorOptions): string {
  return `{
  "name": "${options.projectName}-app-server",
  "version": "0.0.1",
  "dependencies": {
    "@prisma/client": "^4.16.2",
    "amqplib": "^0.10.3",
    "cors": "^2.8.5",
    "express": "^4.18.2",
    "uuid": "^9.0.0"
  },
  "devDependencies": {
    "@types/amqplib": "^0.10.1",
    "@types/cors": "^2.8.13",
    "@types/express": "^4.17.17",
    "@types/node": "^18.16.3",
    "@types/uuid": "^9.0.1",
    "prisma": "^4.16.2",
    "typescript": "^5.0.4"
  },
  "prisma": {
    "schema": "prisma/schema.prisma"
  }
}`;
}
