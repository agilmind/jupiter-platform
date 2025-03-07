// tools/haiku/src/generators/init-haiku/init-haiku.ts
import { Tree, formatFiles, logger } from '@nx/devkit';
import { validateHaikuGitState, setupHaikuBranches } from '../../utils/git';
import { InitHaikuGeneratorSchema } from './schema';


export async function initHaikuGenerator(
  tree: Tree,
  options: InitHaikuGeneratorSchema
) {
  // Verificar estado de Git
  const gitStatus = validateHaikuGitState();

  if (!gitStatus.valid) {
    logger.error(gitStatus.message);
    return;
  }

  // Configurar branches de Git para Haiku
  setupHaikuBranches();

  await formatFiles(tree);

  logger.info('Haiku workspace initialized successfully!');
  logger.info('You are now on the "develop" branch.');
  logger.info('To add applications or services, run:');
  logger.info('  nx g haiku:add-react');
  logger.info('  nx g haiku:add-react-native');
  logger.info('  nx g haiku:add-apollo-prisma');
}

export default initHaikuGenerator;
