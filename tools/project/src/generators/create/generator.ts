import {
  Tree,
  formatFiles,
  names
} from "@nx/devkit";
import * as path from 'path';
import { CreateGeneratorSchema } from "./schema";

// Importar blueprints
import { packageJson as apolloPackageJson, dockerfile as apolloDockerfile, srcIndexTs as apolloSrcIndexTs } from '../../blueprints/apollo-prisma';
import { nginxConf, dockerfile as webAppDockerfile, srcIndexHtml, srcStyleCss, srcScriptJs } from '../../blueprints/web-app';
import { dockerComposeDev } from '../../blueprints/docker-compose';

export default async function (tree: Tree, options: CreateGeneratorSchema) {
  const normalizedOptions = normalizeOptions(tree, options);

  // Crear README.md principal
  tree.write(
    path.join(normalizedOptions.projectRoot, 'README.md'),
    `# ${normalizedOptions.projectName}\n\nProyecto generado automáticamente.\n`
  );

  // Generar estructura y archivos para app-server
  generateAppServer(tree, normalizedOptions);

  // Generar estructura y archivos para web-app
  generateWebApp(tree, normalizedOptions);

  // Generar docker-compose.dev.yml
  tree.write(
    path.join(normalizedOptions.projectRoot, 'docker-compose.dev.yml'),
    dockerComposeDev(normalizedOptions)
  );

  await formatFiles(tree);

  return () => {
    console.log(`✅ Estructura del proyecto "${normalizedOptions.projectName}" creada en ${normalizedOptions.projectRoot}`);
  };
}

function normalizeOptions(tree: Tree, options: CreateGeneratorSchema) {
  const projectName = names(options.projectName).fileName;
  const projectRoot = `apps/${projectName}`;

  return {
    ...options,
    projectName,
    projectRoot
  };
}

function generateAppServer(tree: Tree, options) {
  const { projectRoot } = options;
  const appServerDir = path.join(projectRoot, 'app-server');

  // Crear package.json
  tree.write(
    path.join(appServerDir, 'package.json'),
    apolloPackageJson(options)
  );

  // Crear Dockerfile
  tree.write(
    path.join(appServerDir, 'Dockerfile'),
    apolloDockerfile(options)
  );

  // Crear archivo principal src/index.js
  tree.write(
    path.join(appServerDir, 'src', 'index.js'),
    apolloSrcIndexTs(options)
  );

  // Crear .env.example
  tree.write(
    path.join(appServerDir, '.env.example'),
    `PORT=3000\n`
  );
}

function generateWebApp(tree: Tree, options) {
  const { projectRoot } = options;
  const webAppDir = path.join(projectRoot, 'web-app');

  // Crear nginx.conf
  tree.write(
    path.join(webAppDir, 'nginx.conf'),
    nginxConf(options)
  );

  // Crear Dockerfile
  tree.write(
    path.join(webAppDir, 'Dockerfile'),
    webAppDockerfile(options)
  );

  // Crear archivos de frontend
  tree.write(
    path.join(webAppDir, 'src', 'index.html'),
    srcIndexHtml(options)
  );

  tree.write(
    path.join(webAppDir, 'src', 'style.css'),
    srcStyleCss(options)
  );

  tree.write(
    path.join(webAppDir, 'src', 'script.js'),
    srcScriptJs(options)
  );
}
