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
import * as ejs from 'ejs';
/**
 * Genera la infraestructura para un nuevo proyecto
 * @param tree - El árbol de archivos de NX
 * @param options - Opciones del generador, incluyendo nombres de proyectos y aplicaciones
 */
export async function generateInfrastructure(tree: Tree, options: CreateGeneratorSchema) {
  const {
    projectName,
    appServerName,
    webAppNames,
    nativeAppNames,
    workerNames,
  } = options;
  const projectNameDashed = names(projectName).fileName;

  //  AGREGAR a la generación de infraestructura
  // para generar el archivo dhparam.pem la primera vez si no existe:
  // openssl dhparam -out path/to/your/repo/apps/jupiter/vps-infrastructure/hybrid/nginx-ssl/dhparam.pem 2048

  // Directorio base donde se encuentran los templates
  const templatesDir = joinPathFragments(__dirname, '..', '..', 'blueprints', 'infrastructure');

  // Objeto de sustituciones para los templates
  const substitutions = {
    ...options,
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

    // Determinar la ruta de destino, quitando .template si existe
    const targetFileName = file.endsWith('.template') ? file.slice(0, -'.template'.length) : file;
    const targetFilePath = joinPathFragments(projectTargetDir, targetFileName);

    // Si es un archivo
    if (stats.isFile()) {
      // Si es un archivo .template, procesarlo con EJS
      if (file.endsWith('.template')) {
        const templateContent = fs.readFileSync(filePath, 'utf8');
        try {
          // *** USAR EJS PARA RENDERIZAR ***
          const processedContent = ejs.render(
            templateContent,
            substitutions, // El objeto con todas las variables y arrays disponibles
            { filename: filePath } // Ayuda a EJS a mostrar mejores errores
          );
          // Escribir el resultado procesado
          tree.write(targetFilePath, processedContent);
        } catch (error) {
          console.error(`ERROR procesando template ${filePath}:`, error);
          throw error; // Detener la ejecución si hay un error en la plantilla
        }
      } else {
        // Si NO es .template, simplemente copiarlo tal cual
        const content = fs.readFileSync(filePath);
        tree.write(targetFilePath, content);
      }
    }
    // Si es un directorio que no empieza con __, ignorarlo aquí
    // ya que los subdirectorios específicos (appServer, webApp, etc.)
    // se manejan después con generateFiles.
    else if (stats.isDirectory() && !file.startsWith('__')) {
       // Puedes añadir lógica para copiar recursivamente si es necesario,
       // pero parece que tus generateFiles posteriores cubren los directorios importantes.
       console.log(`Skipping directory in manual processing: ${file}`);
    }
  });

  // Generar infraestructura para el VPS
  generateFiles(
    tree,
    joinPathFragments(templatesDir, 'vps-infrastructure'),
    joinPathFragments('apps', projectNameDashed, 'vps-infrastructure'),
    substitutions
  );

  // Generar estructura para el servidor de aplicación
  generateFiles(
    tree,
    joinPathFragments(templatesDir, 'apps', '__projectName__', '__appServerName__'),
    joinPathFragments('apps', projectNameDashed, names(appServerName).fileName),
    substitutions
  );

  // Generar directorios completos en apps
  for (const dirName of ['bin', 'init-scripts', 'scripts']) {
    generateFiles(
      tree,
      joinPathFragments(templatesDir, 'apps', '__projectName__', dirName),
      joinPathFragments('apps', projectNameDashed, dirName),
      substitutions
    );
  }

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

  // Generar directorios completos en libs
  for (const dirName of ['shared', 'api-interfaces']) {
    generateFiles(
      tree,
      joinPathFragments(templatesDir, 'libs', '__projectName__', dirName),
      joinPathFragments('libs', projectNameDashed, dirName),
      substitutions
    );
  }

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
