import { Tree } from '@nx/devkit';
import { TranscribeGeneratorSchema } from './schema';
import { parseHaikuProject } from '@haiku/parseProject';
import { Haiku } from '@haiku';
import { writeApolloPrisma } from './apolloPrismaWriter';

export async function customGenerateFiles(tree: Tree, options: TranscribeGeneratorSchema, targetDir: string) {
  const haiku: Haiku = await parseHaikuProject({haikuDir: options.haikuDir});
  if (options.runOptions.currentServiceType === 'apollo-prisma') {
    writeApolloPrisma(tree, options, targetDir, haiku);
  }
}
