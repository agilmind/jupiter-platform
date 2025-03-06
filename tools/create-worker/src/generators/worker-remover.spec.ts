import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { Tree, readProjectConfiguration } from '@nx/devkit';

import { workerRemoverGenerator } from './worker-remover/worker-remover';
import { WorkerRemoverSchema } from './schema';

describe('worker-remover generator', () => {
  let tree: Tree;
  const options: WorkerRemoverSchema = { name: 'test' };

  beforeEach(() => {
    tree = createTreeWithEmptyWorkspace();
  });

  it('should run successfully', async () => {
    await workerRemoverGenerator(tree, options);
    const config = readProjectConfiguration(tree, 'test');
    expect(config).toBeDefined();
  });
});
