import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { Tree, readProjectConfiguration } from '@nx/devkit';

import { initHaikuGenerator } from './init-haiku';
import { InitHaikuGeneratorSchema } from './schema';

describe('init-haiku generator', () => {
  let tree: Tree;
  const options: InitHaikuGeneratorSchema = { name: 'test' };

  beforeEach(() => {
    tree = createTreeWithEmptyWorkspace();
  });

  it('should run successfully', async () => {
    await initHaikuGenerator(tree, options);
    const config = readProjectConfiguration(tree, 'test');
    expect(config).toBeDefined();
  });
});
