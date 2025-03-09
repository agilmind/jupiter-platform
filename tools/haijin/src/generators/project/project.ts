import { Tree } from '@nx/devkit';
import { ProjectGeneratorSchema } from './schema';
import { generateProject } from '../../utils/gen-project';
import { userPrompt } from './userPrompts';


async function projectGenerator(
  tree: Tree,
  options: ProjectGeneratorSchema
) {
  await userPrompt(options, tree);
  return generateProject(tree, options);
}

export default projectGenerator;
