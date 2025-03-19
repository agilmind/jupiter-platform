import { Tree } from '@nx/devkit';
import * as path from 'path';
import { GeneratorOptions } from '../../blueprints/types';

export function generateReportWorker(tree: Tree, options: GeneratorOptions): void {
  const { projectRoot } = options;
  const reportWorkerDir = path.join(projectRoot, 'report-worker');

  // Por ahora, solo crear un placeholder
  tree.write(
    path.join(reportWorkerDir, '.gitkeep'),
    ''
  );

  console.log('Report worker generator: Placeholder creado');
}
