import { Tree } from '@nx/devkit';
import * as path from 'path';
import { GeneratorOptions } from '../../blueprints/types';
import * as dockerCompose from '../../blueprints/docker-compose';

export function generateDockerCompose(tree: Tree, options: GeneratorOptions): void {
  const { projectRoot } = options;

  tree.write(
    path.join(projectRoot, 'docker-compose.dev.yml'),
    dockerCompose.dockerComposeDev(options)
  );
}
