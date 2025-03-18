import { Tree } from '@nx/devkit';
import * as path from 'path';
import { GeneratorOptions } from '../../blueprints/types';

import * as apolloPrisma from '../../blueprints/apollo-prisma';

export function generateApolloPrisma(tree: Tree, options: GeneratorOptions): void {
  const { projectRoot } = options;
  const appServerDir = path.join(projectRoot, 'app-server');

  // Crear project.json para NX
  tree.write(
    path.join(appServerDir, 'project.json'),
    apolloPrisma.projectJson(options)
  );

  // Crear archivos de configuración TypeScript
  tree.write(
    path.join(appServerDir, 'tsconfig.json'),
    apolloPrisma.tsConfig(options)
  );

  tree.write(
    path.join(appServerDir, 'tsconfig.app.json'),
    apolloPrisma.tsConfigApp(options)
  );

  // Crear package.json
  tree.write(
    path.join(appServerDir, 'package.json'),
    apolloPrisma.packageJson(options)
  );

  // Crear los Dockerfiles
  tree.write(
    path.join(appServerDir, 'Dockerfile'),
    apolloPrisma.dockerfile(options)
  );

  tree.write(
    path.join(appServerDir, 'Dockerfile.dev'),
    apolloPrisma.dockerfileDev(options)
  );

  // Crear archivo principal src/main.ts
  tree.write(
    path.join(appServerDir, 'src', 'main.ts'),
    apolloPrisma.srcMainTs(options)
  );

  // Crear .env.example
  tree.write(
    path.join(appServerDir, '.env.example'),
    apolloPrisma.envExample(options)
  );
}
