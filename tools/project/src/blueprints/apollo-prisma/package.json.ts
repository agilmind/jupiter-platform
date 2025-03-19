import { GeneratorOptions } from '../types';

export function packageJson(options: GeneratorOptions): string {
  const { projectName } = options;

  return `{
  "name": "${projectName}-app-server",
  "version": "0.0.1",
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "uuid": "^9.0.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.17",
    "@types/cors": "^2.8.13",
    "@types/uuid": "^9.0.0",
    "typescript": "^5.0.4"
  }
}`;
}
