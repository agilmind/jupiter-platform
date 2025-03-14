import { Tree } from '@nx/devkit';
import { TranscribeGeneratorSchema } from './schema';
import * as path from 'path';
import { parseHaikuProject } from '@haiku';
import { Haiku } from '@haiku';
import { writeApolloPrisma } from './apolloPrismaWriter';

export async function customGenerateFiles(tree: Tree, options: TranscribeGeneratorSchema, targetDir: string) {
  const haiku: Haiku = await parseHaikuProject({haikuDir: path.join('haikus', options.name)});
  if (options.runOptions.currentServiceType === 'apollo-prisma') {
    writeApolloPrisma(haiku, tree, targetDir);
  }
}
