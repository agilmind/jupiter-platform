import { Tree } from '@nx/devkit';
import { TranscribeGeneratorSchema } from '../schema';
import * as path from 'path';
export function customGenerateFiles(tree: Tree, options: TranscribeGeneratorSchema, targetDir: string) {
  const generatorsPath = path.join(__dirname, 'files', options.runOptions.currentServiceType, 'generators');
}
