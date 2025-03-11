import { Tree } from '@nx/devkit';
import { TranscribeGeneratorSchema } from '../schema';
import * as path from 'path';
import { parseHaikuProject } from '../../../haiku-parser/parseProject';
export async function customGenerateFiles(tree: Tree, options: TranscribeGeneratorSchema, targetDir: string) {
  const generatorsPath = path.join(__dirname, 'files', options.runOptions.currentServiceType, 'generators');
  const haiku = await parseHaikuProject({haikuDir: path.join('haikus', options.name)});
}
