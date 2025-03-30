import {
  Tree,
  formatFiles,
  generateFiles,
  names,
  joinPathFragments,
  visitNotIgnoredFiles
} from '@nx/devkit';
import * as path from 'path';
import * as fs from 'fs';
import { CreateGeneratorSchema } from './schema';

/**
 * Genera la infraestructura para un nuevo proyecto
 * @param tree - El árbol de archivos de NX
 * @param options - Opciones del generador, incluyendo nombres de proyectos y aplicaciones
 */
export async function generateInfrastructure(tree: Tree, options: CreateGeneratorSchema) {
  const { projectName, appServerName, webAppNames, nativeAppNames, workerNames } = options;
  const projectNameDashed = names(projectName).fileName;

  // Directorio base donde se encuentran los templates
  const templatesDir = joinPathFragments(__dirname, '..', '..', 'blueprints', 'infrastructure');

  // Objeto de sustituciones para los templates
  const substitutions = {
    projectName: projectNameDashed,
    appServerName: names(appServerName).fileName,
    webAppName: webAppNames[0] || 'web-app',
    workerName: workerNames[0] || 'worker-sample',
    tmpl: ''
  };

  // 1. Generar archivos a nivel de proyecto (excluyendo directorios específicos)
  const projectTemplateDir = joinPathFragments(templatesDir, 'apps', '__projectName__');
  const projectTargetDir = joinPathFragments('apps', projectNameDashed);

  // Asegurarse de que el directorio de destino existe
  if (!tree.exists(projectTargetDir)) {
    tree.write(joinPathFragments(projectTargetDir, '.gitkeep'), '');
  }

  // Leer directamente los archivos del directorio de templates del proyecto
  const projectFiles = fs.readdirSync(projectTemplateDir);

  // Procesar solo los archivos, excluyendo directorios que empiezan con __
  projectFiles.forEach(file => {
    const filePath = path.join(projectTemplateDir, file);
    const stats = fs.statSync(filePath);

    // Si es un archivo
    if (stats.isFile()) {
      // Leer el contenido del archivo
      let content = fs.readFileSync(filePath, 'utf8');

      // Reemplazar variables
      Object.entries(substitutions).forEach(([key, value]) => {
        const regex = new RegExp(`<%=\\s*${key}\\s*%>`, 'g');
        content = content.replace(regex, value);
      });

      // Escribir en el árbol
      const targetFilePath = joinPathFragments(projectTargetDir, file.replace('.template', ''));
      tree.write(targetFilePath, content);
    }
    // Si es un directorio que no empieza con __
    else if (stats.isDirectory() && !file.startsWith('__')) {
      // Procesar directorio recursivamente (si es necesario)
      // Aquí podrías implementar una función recursiva para subdirectorios
    }
  });

  // Generar estructura para el servidor de aplicación
  generateFiles(
    tree,
    joinPathFragments(templatesDir, 'apps', '__projectName__', '__appServerName__'),
    joinPathFragments('apps', projectNameDashed, names(appServerName).fileName),
    substitutions
  );

  // Generar directorio con scripts
  generateFiles(
    tree,
    joinPathFragments(templatesDir, 'apps', '__projectName__', 'bin'),
    joinPathFragments('apps', projectNameDashed, 'bin'),
    substitutions
  );

  generateFiles(
    tree,
    joinPathFragments(templatesDir, 'apps', '__projectName__', 'postgres-init'),
    joinPathFragments('apps', projectNameDashed, 'postgres-init'),
    substitutions
  );

  generateFiles(
    tree,
    joinPathFragments(templatesDir, 'apps', '__projectName__', 'rabbitmq-init'),
    joinPathFragments('apps', projectNameDashed, 'rabbitmq-init'),
    substitutions
  );

  // Generar estructura para cada aplicación web
  webAppNames.forEach(webAppName => {
    generateFiles(
      tree,
      joinPathFragments(templatesDir, 'apps', '__projectName__', '__webAppName__'),
      joinPathFragments('apps', projectNameDashed, names(webAppName).fileName),
      { ...substitutions, webAppName: names(webAppName).fileName }
    );
  });

  // Generar estructura para cada aplicación nativa
  nativeAppNames.forEach(nativeAppName => {
    generateFiles(
      tree,
      joinPathFragments(templatesDir, 'apps', '__projectName__', '__nativeAppName__'),
      joinPathFragments('apps', projectNameDashed, names(nativeAppName).fileName),
      { ...substitutions, nativeAppName: names(nativeAppName).fileName }
    );
  });

  // Generar estructura para cada worker
  workerNames.forEach(workerName => {
    generateFiles(
      tree,
      joinPathFragments(templatesDir, 'apps', '__projectName__', '__workerName__'),
      joinPathFragments('apps', projectNameDashed, names(workerName).fileName),
      { ...substitutions, workerName: names(workerName).fileName }
    );
  });

  // Generar estructura para las librerías compartidas
  generateFiles(
    tree,
    joinPathFragments(templatesDir, 'libs', '__projectName__', 'shared'),
    joinPathFragments('libs', projectNameDashed, 'shared'),
    substitutions
  );

  // Generar estructura para las interfaces de API
  generateFiles(
    tree,
    joinPathFragments(templatesDir, 'libs', '__projectName__', 'api-interfaces'),
    joinPathFragments('libs', projectNameDashed, 'api-interfaces'),
    substitutions
  );

  // Formatear todos los archivos generados
  await formatFiles(tree);

  return tree;
}

// En tu archivo generate-infrastructure.ts, añade esta función
export async function setupGitHubActions(tree: Tree, options: CreateGeneratorSchema) {
  const { projectName } = options;
  const projectNameDashed = names(projectName).fileName;

  // Crear directorio para GitHub Actions
  if (!tree.exists('.github/workflows')) {
    tree.write('.github/workflows/.gitkeep', '');
  }

  // Generar o actualizar CI workflow
  if (!tree.exists('.github/workflows/ci.yml')) {
    generateFiles(
      tree,
      path.join(__dirname, '..', '..', 'blueprints', 'github'),
      '.github/workflows',
      { projectName: projectNameDashed, tmpl: '' },
      ['ci.yml.template']
    );
  }

  // Generar o actualizar Deploy workflow
  if (!tree.exists('.github/workflows/deploy.yml')) {
    generateFiles(
      tree,
      path.join(__dirname, '..', '..', 'blueprints', 'github'),
      '.github/workflows',
      { projectName: projectNameDashed, tmpl: '' },
      ['deploy.yml.template']
    );
  }

  // Generar instrucciones para configurar GitHub
  const secretsInstructions = `
# Configuración de GitHub Secrets para ${projectNameDashed}

Para configurar el despliegue automático, añade estos secretos en GitHub:

- SSH_HOST: jupiter.ar
- SSH_USER: fido
- SSH_PRIVATE_KEY: [Tu clave SSH privada]
- SERVER_PORT: 4000
- POSTGRES_USER: postgres
- POSTGRES_PASSWORD: postgres
- POSTGRES_DB: jupiter
- DATABASE_URL: postgresql://postgres:postgres@postgres:5432/jupiter?schema=public&connection_limit=10&pool_timeout=10&idle_timeout=10
- RABBITMQ_DEFAULT_USER: guest
- RABBITMQ_DEFAULT_PASS: guest
- RABBITMQ_HOST: rabbitmq
- RABBITMQ_PORT: 5672
- RABBITMQ_URL: amqp://guest:guest@rabbitmq:5672
- API_URL: https://webapp.jupiter.ar
  `;

  // Guardar estas instrucciones en un archivo
  tree.write(`apps/${projectNameDashed}/GITHUB_SETUP.md`, secretsInstructions);

  return tree;
}

// Y en tu generator.ts principal:
export default async function (tree: Tree, options: CreateGeneratorSchema) {
  // Generar infraestructura
  await generateInfrastructure(tree, options);

  // Configurar GitHub Actions
  await setupGitHubActions(tree, options);

  // Resto de tu código...
}
