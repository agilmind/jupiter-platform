import {
  Tree,
  formatFiles,
  generateFiles,
  names,
  joinPathFragments,
} from '@nx/devkit';
import * as path from 'path';
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
    __projectName__: projectNameDashed,
    __appServerName__: names(appServerName).fileName,
  };

  // Archivos a nivel de monorepo (si aún no existen)
  const monorepoFiles = [
    'nx.json',
    'package.json',
    'tsconfig.base.json',
    'jest.config.js',
    '.eslintrc.json',
    '.prettierrc',
  ];

  // Generar archivos a nivel de monorepo si no existen
  monorepoFiles.forEach(file => {
    const filePath = file;
    if (!tree.exists(filePath)) {
      generateFiles(
        tree,
        path.join(templatesDir),
        '/',
        { ...substitutions, tmpl: '' },
        [`${file}.template`]
      );
    }
  });

  // Generar estructura de directorios y archivos para el proyecto
  generateFiles(
    tree,
    path.join(templatesDir, 'apps', '__projectName__'),
    `apps/${projectNameDashed}`,
    { ...substitutions, tmpl: '' }
  );

  // Generar estructura para el servidor de aplicación
  generateFiles(
    tree,
    path.join(templatesDir, 'apps', '__projectName__', '__appServerName__'),
    `apps/${projectNameDashed}/${names(appServerName).fileName}`,
    { ...substitutions, tmpl: '' }
  );

  // Generar estructura para cada aplicación web
  webAppNames.forEach(webAppName => {
    generateFiles(
      tree,
      path.join(templatesDir, 'apps', '__projectName__', '__webAppName__'),
      `apps/${projectNameDashed}/${names(webAppName).fileName}`,
      { ...substitutions, __webAppName__: names(webAppName).fileName, tmpl: '' }
    );
  });

  // Generar estructura para cada aplicación nativa
  nativeAppNames.forEach(nativeAppName => {
    generateFiles(
      tree,
      path.join(templatesDir, 'apps', '__projectName__', '__nativeAppName__'),
      `apps/${projectNameDashed}/${names(nativeAppName).fileName}`,
      { ...substitutions, __nativeAppName__: names(nativeAppName).fileName, tmpl: '' }
    );
  });

  // Generar estructura para cada worker
  workerNames.forEach(workerName => {
    generateFiles(
      tree,
      path.join(templatesDir, 'apps', '__projectName__', '__workerName__'),
      `apps/${projectNameDashed}/${names(workerName).fileName}`,
      { ...substitutions, __workerName__: names(workerName).fileName, tmpl: '' }
    );
  });

  // Generar estructura para las librerías compartidas
  generateFiles(
    tree,
    path.join(templatesDir, 'libs', '__projectName__', 'shared'),
    `libs/${projectNameDashed}/shared`,
    { ...substitutions, tmpl: '' }
  );

  // Generar estructura para las interfaces de API
  generateFiles(
    tree,
    path.join(templatesDir, 'libs', '__projectName__', 'api-interfaces'),
    `libs/${projectNameDashed}/api-interfaces`,
    { ...substitutions, tmpl: '' }
  );

  // Formatear todos los archivos generados
  await formatFiles(tree);

  return tree;
}
