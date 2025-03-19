import { Tree } from '@nx/devkit';
import * as path from 'path';
import { GeneratorOptions } from '../../blueprints/types';

export function generateEmailWorker(tree: Tree, options: GeneratorOptions): void {
  const { projectRoot } = options;
  const emailWorkerDir = path.join(projectRoot, 'email-worker');

  // Por ahora, solo crear un placeholder
  tree.write(
    path.join(emailWorkerDir, '.gitkeep'),
    ''
  );

  console.log('Email worker generator: Placeholder creado');
}
