import { Tree } from '@nx/devkit';
import * as path from 'path';
import { GeneratorOptions } from '../../blueprints/types';
import * as scraperWorker from '../../blueprints/scraper-worker';

export function generateScraperWorker(tree: Tree, options: GeneratorOptions): void {
  const { projectRoot } = options;
  const scraperWorkerDir = path.join(projectRoot, 'scraper-worker');

  // Crear package.json
  tree.write(
    path.join(scraperWorkerDir, 'package.json'),
    scraperWorker.packageJson(options)
  );

  // Crear Dockerfile
  tree.write(
    path.join(scraperWorkerDir, 'Dockerfile'),
    scraperWorker.dockerfile(options)
  );

  // Crear archivos de TypeScript
  tree.write(
    path.join(scraperWorkerDir, 'tsconfig.json'),
    scraperWorker.tsConfig(options)
  );

  tree.write(
    path.join(scraperWorkerDir, 'tsconfig.app.json'),
    scraperWorker.tsConfigApp(options)
  );

  // Crear .dockerignore
  tree.write(
    path.join(scraperWorkerDir, '.dockerignore'),
    scraperWorker.dockerignore(options)
  );

  // Crear archivos fuente
  tree.write(
    path.join(scraperWorkerDir, 'src', 'main.ts'),
    scraperWorker.srcMainTs(options)
  );

  tree.write(
    path.join(scraperWorkerDir, 'src', 'types.ts'),
    scraperWorker.typesTs(options)
  );

  tree.write(
    path.join(scraperWorkerDir, 'src', 'base-worker.ts'),
    scraperWorker.baseWorkerTs(options)
  );

  tree.write(
    path.join(scraperWorkerDir, 'src', 'scraper.worker.ts'),
    scraperWorker.scraperWorkerTs(options)
  );

  // Crear utilidades
  tree.write(
    path.join(scraperWorkerDir, 'src', 'utils', 'playwright-utils.ts'),
    scraperWorker.playwrightUtilsTs(options)
  );

  // Crear utilidades
  tree.write(
    path.join(scraperWorkerDir, 'src', 'types', 'ampqlib.d.ts'),
    scraperWorker.ampqlibTs(options)
  );

  // Crear .env.example
  tree.write(
    path.join(scraperWorkerDir, '.env.example'),
    `RABBITMQ_URL=amqp://guest:guest@rabbitmq:5672
SCRAPER_QUEUE=scraper_tasks
SCRAPER_RETRY_QUEUE=scraper_retry
SCRAPER_DLQ=scraper_dlq
PREFETCH=1
MAX_RETRIES=3
BACKOFF_MULTIPLIER=2000
GRAPHQL_URL=http://app-server:3000/graphql
`
  );
}
