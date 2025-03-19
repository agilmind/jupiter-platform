import { Tree } from '@nx/devkit';
import * as path from 'path';
import { GeneratorOptions } from '../../blueprints/types';

export function generateScraperWorker(tree: Tree, options: GeneratorOptions): void {
  const { projectRoot } = options;
  const scraperWorkerDir = path.join(projectRoot, 'scraper-worker');

  // Por ahora, solo crear un placeholder
  tree.write(
    path.join(scraperWorkerDir, '.gitkeep'),
    ''
  );

  console.log('Scraper worker generator: Placeholder creado');
}
