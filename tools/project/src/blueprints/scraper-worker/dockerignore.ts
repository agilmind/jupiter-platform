import { GeneratorOptions } from '../types';

export function dockerignore(options: GeneratorOptions): string {
  return `node_modules
npm-debug.log
dist
.git
.gitignore`;
}
