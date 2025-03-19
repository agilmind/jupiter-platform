import { GeneratorOptions } from '../types';

export function networks(options: GeneratorOptions): string {
  return `networks:
  app-network:
    name: ${options.projectName}-network`;
}
