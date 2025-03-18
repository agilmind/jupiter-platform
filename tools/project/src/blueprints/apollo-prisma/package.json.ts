import { GeneratorOptions } from '../types';

export function packageJson(options: GeneratorOptions): string {
  const { projectName } = options;

  return `{
  "name": "${projectName}-server",
  "version": "1.0.0",
  "description": "API server for ${projectName}",
  "main": "src/index.js",
  "scripts": {
    "start": "node src/index.js",
    "dev": "nodemon src/index.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5"
  },
  "devDependencies": {
    "nodemon": "^2.0.22"
  }
}`;
}
