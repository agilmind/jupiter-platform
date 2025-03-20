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
    "amqplib": "^0.10.5",
    "playwright": "1.51.1",
    "uuid": "^11.1.0",
    "ts-node": "^10.9.2",
    "typescript": "^5.7.2"
  },
  "devDependencies": {
    "@types/amqplib": "^0.10.5",
    "@types/node": "^18.16.3"
  }
}`;
}
