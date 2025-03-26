const fs = require('fs');
const path = require('path');

// Directorio base donde se crearán los templates
const baseDir = 'tools/project/src/blueprints/infrastructure';

// Lista de archivos de infraestructura a crear como templates
const filesToCreate = [
  // A nivel del monorepo (estos pueden ser referencias)
  'nx.json.template',
  'package.json.template',
  'tsconfig.base.json.template',
  'jest.config.js.template',
  '.eslintrc.json.template',
  '.prettierrc.template',

  // Nivel de proyecto
  'apps/__projectName__/project.json.template',
  'apps/__projectName__/tsconfig.json.template',
  'apps/__projectName__/.env.example.template',
  'apps/__projectName__/docker-compose.dev.yml.template',
  'apps/__projectName__/docker-compose.prod.yml.template',
  'apps/__projectName__/docker-compose.stage.yml.template',

  // App Server
  'apps/__projectName__/__appServerName__/project.json.template',
  'apps/__projectName__/__appServerName__/package.json.template',
  'apps/__projectName__/__appServerName__/tsconfig.json.template',
  'apps/__projectName__/__appServerName__/tsconfig.app.json.template',
  'apps/__projectName__/__appServerName__/.env.example.template',
  'apps/__projectName__/__appServerName__/jest.config.js.template',
  'apps/__projectName__/__appServerName__/Dockerfile.template',
  'apps/__projectName__/__appServerName__/.dockerignore.template',
  'apps/__projectName__/__appServerName__/prisma/schema.prisma.template',

  // Web App (plantilla genérica)
  'apps/__projectName__/__webAppName__/project.json.template',
  'apps/__projectName__/__webAppName__/package.json.template',
  'apps/__projectName__/__webAppName__/tsconfig.json.template',
  'apps/__projectName__/__webAppName__/tsconfig.app.json.template',
  'apps/__projectName__/__webAppName__/vite.config.ts.template',
  'apps/__projectName__/__webAppName__/index.html.template',
  'apps/__projectName__/__webAppName__/.env.example.template',
  'apps/__projectName__/__webAppName__/jest.config.js.template',
  'apps/__projectName__/__webAppName__/Dockerfile.template',
  'apps/__projectName__/__webAppName__/.dockerignore.template',

  // Native App (plantilla genérica)
  'apps/__projectName__/__nativeAppName__/project.json.template',
  'apps/__projectName__/__nativeAppName__/package.json.template',
  'apps/__projectName__/__nativeAppName__/tsconfig.json.template',
  'apps/__projectName__/__nativeAppName__/metro.config.js.template',
  'apps/__projectName__/__nativeAppName__/app.json.template',
  'apps/__projectName__/__nativeAppName__/.env.example.template',
  'apps/__projectName__/__nativeAppName__/jest.config.js.template',
  'apps/__projectName__/__nativeAppName__/Dockerfile.template',
  'apps/__projectName__/__nativeAppName__/.dockerignore.template',

  // Worker (plantilla genérica)
  'apps/__projectName__/__workerName__/project.json.template',
  'apps/__projectName__/__workerName__/package.json.template',
  'apps/__projectName__/__workerName__/tsconfig.json.template',
  'apps/__projectName__/__workerName__/tsconfig.app.json.template',
  'apps/__projectName__/__workerName__/.env.example.template',
  'apps/__projectName__/__workerName__/jest.config.js.template',
  'apps/__projectName__/__workerName__/Dockerfile.template',
  'apps/__projectName__/__workerName__/.dockerignore.template',

  // Librerías compartidas
  'libs/__projectName__/shared/project.json.template',
  'libs/__projectName__/shared/package.json.template',
  'libs/__projectName__/shared/tsconfig.json.template',
  'libs/__projectName__/shared/tsconfig.lib.json.template',
  'libs/__projectName__/shared/jest.config.js.template',

  // Interfaces de API
  'libs/__projectName__/api-interfaces/project.json.template',
  'libs/__projectName__/api-interfaces/package.json.template',
  'libs/__projectName__/api-interfaces/tsconfig.json.template',
  'libs/__projectName__/api-interfaces/tsconfig.lib.json.template'
];

/**
 * Crea un directorio si no existe
 * @param {string} dirPath - Ruta del directorio a crear
 */
function createDirectoryIfNotExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`Directorio creado: ${dirPath}`);
  }
}

/**
 * Crea un archivo vacío
 * @param {string} filePath - Ruta del archivo a crear
 */
function createEmptyFile(filePath) {
  fs.writeFileSync(filePath, '', 'utf8');
  console.log(`Archivo creado: ${filePath}`);
}

/**
 * Función principal para generar la estructura de templates
 */
function generateTemplates() {
  console.log('Iniciando la generación de templates...');

  // Crear el directorio base si no existe
  createDirectoryIfNotExists(baseDir);

  // Crear cada archivo template
  filesToCreate.forEach(filePath => {
    const fullPath = path.join(baseDir, filePath);
    const directory = path.dirname(fullPath);

    // Crear el directorio del archivo si no existe
    createDirectoryIfNotExists(directory);

    // Crear el archivo template vacío
    createEmptyFile(fullPath);
  });

  console.log('¡Generación de templates completada!');
}

// Ejecutar la función principal
generateTemplates();
