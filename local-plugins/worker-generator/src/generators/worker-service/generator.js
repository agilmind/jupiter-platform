const { generateFiles, formatFiles, names, getWorkspaceLayout, joinPathFragments, Tree } = require('@nx/devkit');
const path = require('path');

function normalizeOptions(tree, options) {
  const name = names(options.name).fileName;
  const projectName = name;
  const projectRoot = joinPathFragments('services', name);

  // Generar diferentes versiones del nombre
  const className = `${names(options.name).className}Worker`;
  const propertyName = names(options.name).propertyName;
  const constantName = names(options.name).constantName;
  const fileName = names(options.name).fileName;

  // Lista de tags para el proyecto
  const parsedTags = [`worker`, `service`, `domain:${options.domain || 'worker'}`];

  return {
    ...options,
    name,
    projectName,
    projectRoot,
    className,
    propertyName,
    constantName,
    fileName,
    offsetFromRoot: '../..',
    parsedTags,
    template: ''
  };
}

function addFiles(tree, options) {
  const templateOptions = {
    ...options,
    ...names(options.name),
    dot: '.',
    template: ''
  };

  generateFiles(
    tree,
    path.join(__dirname, 'files'),
    options.projectRoot,
    templateOptions
  );
}

function generator(tree, options) {
  const normalizedOptions = normalizeOptions(tree, options);

  // Añadir archivos
  addFiles(tree, normalizedOptions);

  // Formato de archivos
  formatFiles(tree);

  // Información útil
  console.log(`🚀 Worker service ${normalizedOptions.projectName} created successfully!`);
  console.log(`📂 Location: ${normalizedOptions.projectRoot}`);

  return () => {
    console.log(`\nNext steps:`);
    console.log(` - Build: nx build ${normalizedOptions.projectName}`);
    console.log(` - Run: nx serve ${normalizedOptions.projectName}`);
  };
}

module.exports = generator;
generator.schema = require('./schema.json');
