import { Tree } from '@nx/devkit';
import { Haiku } from '@haiku';
import { schemaPrismaTs } from '@apolloPrisma/src/prisma/schema.prisma';
import * as path from 'path';

export function writeApolloPrisma(haiku: Haiku, tree: Tree, targetDir: string) {
  const content = schemaPrismaTs(haiku);
  tree.write(path.join(targetDir, 'src/prisma/schema.prisma'), content);
}
