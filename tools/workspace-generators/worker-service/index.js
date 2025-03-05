const { formatFiles, generateFiles, joinPathFragments, names } = require('@nx/devkit');
const path = require('path');

function normalizeOptions(tree, options) {
  const name = names(options.name).fileName;
  const projectDirectory = name;
  const projectName = projectDirectory.replace(new RegExp('/', 'g'), '-');
  const projectRoot = joinPathFragments('apps', projectDirectory);
  
  // Generar diferentes versiones del nombre
  const className = `${names(options.name).className}Worker`;
  const propertyName = names(options.name).propertyName;
  const constantName = names(options.name).constantName;
  const fileName = names(options.name).fileName;
  
  // Lista de tags para el proyecto
  const parsedTags = [`worker`, `service`, `domain:${options.domain || 'worker'}`];
  
  return {
    ...options,
    projectName,
    projectRoot,
    projectDirectory,
    parsedTags,
    className,
    propertyName,
    constantName,
    fileName,
    offsetFromRoot: '../..',
    template: '',
    dot: '.'
  };
}

function addFiles(tree, options) {
  const templateOptions = {
    ...options,
    ...names(options.name),
    template: ''
  };
  
  generateFiles(
    tree,
    joinPathFragments(__dirname, 'files'),
    options.projectRoot,
    templateOptions
  );
}

module.exports = async function(tree, options) {
  const normalizedOptions = normalizeOptions(tree, options);
  
  addFiles(tree, normalizedOptions);
  
  await formatFiles(tree);
  
  // Información útil para el usuario
  console.log(`🚀 Worker service ${normalizedOptions.projectName} created successfully!`);
  console.log(`📂 Location: ${normalizedOptions.projectRoot}`);
  console.log(`📋 Run the following commands:`);
  console.log(`   nx build ${normalizedOptions.projectName}`);
  console.log(`   nx serve ${normalizedOptions.projectName}`);
};
