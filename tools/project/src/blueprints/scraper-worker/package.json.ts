import { GeneratorOptions } from '../types';

export function packageJson(options: GeneratorOptions): string {
  return `{
  "name": "${options.projectName}-scraper-worker",
  "version": "0.0.1",
  "description": "Web scraper worker for ${options.projectName}",
  "main": "src/main.ts",
  "scripts": {
    "start": "ts-node --transpile-only src/main.ts",
    "dev": "ts-node --transpile-only src/main.ts"
  },
  "dependencies": {
    "amqplib": "^0.10.3",
    "playwright": "1.40.0",
    "uuid": "^9.0.0",
    "ts-node": "^10.9.1",
    "typescript": "^5.0.4"
  },
  "devDependencies": {
    "@types/amqplib": "^0.10.1",
    "@types/node": "^18.16.3",
    "@types/uuid": "^9.0.1"
  }
}`;
}
