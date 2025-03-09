import { Tree } from '@nx/devkit';
import { ProjectGeneratorSchema } from './schema';
import { generateProject } from '../../utils/gen-project';
import { userPrompt } from './userPrompts';
import { writeApolloPrismaFiles } from './write-apollo-prisma';


async function projectGenerator(
  tree: Tree,
  options: ProjectGeneratorSchema
) {
  await userPrompt(options, tree);
  return generateProject(tree, options, writeApolloPrismaFiles);
}

export default projectGenerator;
