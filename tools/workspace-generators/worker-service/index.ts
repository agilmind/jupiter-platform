import {
  Tree,
  formatFiles,
  generateFiles,
  joinPathFragments,
  names,
  getWorkspaceLayout,
  updateJson
} from '@nx/devkit';

interface WorkerServiceGeneratorSchema {
  name: string;
  domain: string;
  directory?: string;
  skipFormat?: boolean;
  skipTsConfig?: boolean;
}

interface NormalizedSchema extends WorkerServiceGeneratorSchema {
  projectName: string;
  projectRoot: string;
  projectDirectory: string;
  parsedTags: string[];
  className: string;
  propertyName: string;
  constantName: string;
  fileName: string;
}

function normalizeOptions(tree: Tree, options: WorkerServiceGeneratorSchema): NormalizedSchema {
  const name = names(options.name).fileName;
  const projectDirectory = name;
  const projectName = projectDirectory.replace(new RegExp('/', 'g'), '-');
  const projectRoot = joinPathFragments(options.directory || 'apps', projectDirectory);
  
  // Generar diferentes versiones del nombre
  const className = `${names(options.name).className}Worker`;
  const propertyName = names(options.name).propertyName;
  const constantName = names(options.name).constantName;
  const fileName = names(options.name).fileName;
  
  // Lista de tags para el proyecto
  const parsedTags = [`worker`, `service`, `domain:${options.domain}`];
  
  return {
    ...options,
    projectName,
    projectRoot,
    projectDirectory,
    parsedTags,
    className,
    propertyName,
    constantName,
    fileName
  };
}

function addFiles(tree: Tree, options: NormalizedSchema) {
  const templateOptions = {
    ...options,
    ...names(options.name),
    offsetFromRoot: '../../',
    template: ''
  };
  
  generateFiles(
    tree,
    joinPathFragments(__dirname, 'files'),
    options.projectRoot,
    templateOptions
  );
}

function updateTsConfig(tree: Tree, options: NormalizedSchema) {
  if (options.skipTsConfig) {
    return;
  }
  
  // Actualizar tsconfig.base.json para incluir el nuevo proyecto
  updateJson(tree, 'tsconfig.base.json', (json) => {
    const c = json.compilerOptions;
    c.paths = c.paths || {};
    
    const importPath = `@jupiter/${options.projectName}`;
    const path = [`${options.projectRoot}/src/index.ts`];
    
    if (!c.paths[importPath]) {
      c.paths[importPath] = path;
    }
    
    return json;
  });
}

export default async function (tree: Tree, options: WorkerServiceGeneratorSchema) {
  const normalizedOptions = normalizeOptions(tree, options);
  
  addFiles(tree, normalizedOptions);
  updateTsConfig(tree, normalizedOptions);
  
  if (!options.skipFormat) {
    await formatFiles(tree);
  }
  
  // Información útil para el usuario
  console.log(`🚀 Worker service ${normalizedOptions.projectName} created successfully!`);
  console.log(`📂 Location: ${normalizedOptions.projectRoot}`);
  console.log(`📋 Run the following commands:`);
  console.log(`   nx build ${normalizedOptions.projectName}`);
  console.log(`   nx serve ${normalizedOptions.projectName}`);
}
