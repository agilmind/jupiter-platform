import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { Tree, readProjectConfiguration } from '@nx/devkit';

import { workerGeneratorGenerator } from './worker-generator';
import { WorkerGeneratorSchema } from './schema';

describe('worker-generator generator', () => {
  let tree: Tree;
  const options: WorkerGeneratorSchema = { name: 'test', directory: 'services', description: 'test' };

  beforeEach(() => {
    tree = createTreeWithEmptyWorkspace();
  });

  it('should run successfully', async () => {
    await workerGeneratorGenerator(tree, options);
    const config = readProjectConfiguration(tree, 'test');
    expect(config).toBeDefined();
  });
});
