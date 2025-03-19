import { Tree } from '@nx/devkit';
import * as path from 'path';
import { GeneratorOptions } from '../../blueprints/types';

export function generateNativeApp(tree: Tree, options: GeneratorOptions): void {
  const { projectRoot } = options;
  const nativeAppDir = path.join(projectRoot, 'native-app');

  // Por ahora, solo crear un placeholder
  tree.write(
    path.join(nativeAppDir, '.gitkeep'),
    ''
  );

  console.log('Native app generator: Placeholder creado');
}
