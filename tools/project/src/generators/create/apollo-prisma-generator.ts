import { Tree } from '@nx/devkit';
import * as path from 'path';
import { GeneratorOptions } from '../../blueprints/types';
import * as apolloPrisma from '../../blueprints/apollo-prisma';

export function generateApolloPrisma(tree: Tree, options: GeneratorOptions): void {
  const { projectRoot } = options;
  const appServerDir = path.join(projectRoot, 'app-server');

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

  // Crear Dockerfile
  tree.write(
    path.join(appServerDir, 'Dockerfile'),
    apolloPrisma.dockerfile(options)
  );

  tree.write(
    path.join(appServerDir, 'Dockerfile.dev'),
    apolloPrisma.dockerfileDev(options)
  );

  // Crear archivos fuente
  tree.write(
    path.join(appServerDir, 'src', 'main.ts'),
    apolloPrisma.srcMainTs(options)
  );

  // Crear schema Prisma
  tree.write(
    path.join(appServerDir, 'prisma', 'schema.prisma'),
    apolloPrisma.prismaSchema(options)
  );

  // Crear .env.example
  tree.write(
    path.join(appServerDir, '.env.example'),
    `PORT=3000
# Para desarrollo en Docker
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/${options.projectName}?schema=public
# Para desarrollo local (fuera de Docker)
LOCAL_DEV=true
RABBITMQ_LOCAL_URL=amqp://localhost:5672
DATABASE_URL_LOCAL=postgresql://postgres:postgres@localhost:5433/${options.projectName}?schema=public
`
  );
}
