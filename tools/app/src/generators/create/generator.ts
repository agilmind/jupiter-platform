import {
  Tree,
  formatFiles,
  generateFiles,
  addProjectConfiguration,
  joinPathFragments,
  names,
  offsetFromRoot
} from '@nx/devkit';
import { AppCreateGeneratorSchema } from './schema'; // Importamos la interfaz del schema
import * as path from 'path'; // Usaremos path para join a __dirname

// Interfaz auxiliar para las opciones pasadas a generateFiles
interface TemplateOptions extends AppCreateGeneratorSchema {
  projectName: string; // Ya normalizado (kebab-case)
  appName: string; // Ya normalizado (kebab-case)
  nxProjectName: string; // Nombre combinado para Nx (e.g., project-app)
  projectRoot: string; // Ruta raíz del proyecto generado (e.g., apps/project/app)
  offsetFromRoot: string; // Ruta relativa desde projectRoot hasta la raíz del workspace
  // Propiedades adicionales requeridas por generateFiles
  template: '';
  dot: '.';
}

// Función auxiliar para generar archivos específicos del tipo 'static'
function generateStaticAppFiles(tree: Tree, options: TemplateOptions): void {
  const blueprintPath = joinPathFragments(
    __dirname,
    '..', // Moverse de 'create' a 'generators'
    '..', // Moverse de 'generators' a 'src'
    'app-blueprints', // Entrar a 'app-blueprints'
    'static' // Entrar a 'static'
  );

  console.log(`Generating static app files from ${blueprintPath} to ${options.projectRoot}`);

  generateFiles(
    tree, // El árbol del sistema de archivos virtual
    blueprintPath, // Ruta a los archivos de plantilla
    options.projectRoot, // Ruta de destino donde se generarán los archivos
    options // Opciones/variables para sustituir en los templates (<%= variable %>)
  );
}

// Función principal del generador
export async function appCreateGenerator(
  tree: Tree,
  options: AppCreateGeneratorSchema
): Promise<void> {
  // 1. Normalizar opciones y calcular nombres/rutas
  const projectNames = names(options.projectName);
  const appNames = names(options.appName);

  const projectNameNormalized = projectNames.fileName; // e.g., 'jupiter'
  const appNameNormalized = appNames.fileName; // e.g., 'www'

  // Calcular la ruta raíz del proyecto de la aplicación
  const projectRoot =
    options.directory ?? // Usar directorio explícito si se proporciona
    joinPathFragments('apps', projectNameNormalized, appNameNormalized); // Default: apps/<project-name>/<app-name>

  // Crear un nombre único para el proyecto en Nx
  const nxProjectName = `${projectNameNormalized}-${appNameNormalized}`; // e.g., 'jupiter-www'

  // Parsear tags y añadir tags por defecto
  const tags: string[] = options.tags
  ? options.tags.split(',').map((s) => s.trim()).filter(Boolean) // Separa por coma, quita espacios, filtra vacíos
  : []; // Si no se proporcionan tags, inicializa como array vacío
  tags.push(`scope:${projectNameNormalized}`, `type:${options.appType}`);

  console.log(`Generating app '${nxProjectName}' at ${projectRoot}`);
  console.log(` - Project Name: ${options.projectName}`);
  console.log(` - App Name: ${options.appName}`);
  console.log(` - App Type: ${options.appType}`);
  console.log(` - Domain: ${options.domain}`);
  console.log(` - Tags: ${tags.join(', ')}`);

  // 2. Registrar el proyecto en la configuración de Nx
  addProjectConfiguration(tree, nxProjectName, {
    root: projectRoot,
    projectType: 'application',
    // sourceRoot: projectRoot, // Para 'static', el source es la raíz del proyecto mismo
    tags: tags,
    targets: {
      // Target simple para detección con 'nx affected' en workflows CD
      'deploy-info': {
         executor: 'nx:noop'
      }
      // Aquí se podrían añadir targets 'build', 'lint', 'serve' específicos más adelante
    },
  });

  // 3. Preparar opciones para las plantillas
  const templateOptions: TemplateOptions = {
    ...options, // Pasamos las opciones originales
    projectName: projectNameNormalized,
    appName: appNameNormalized,
    nxProjectName: nxProjectName,
    projectRoot: projectRoot,
    offsetFromRoot: offsetFromRoot(projectRoot), // Calcula ../../.. etc.
    template: '',
    dot: '.',
  };

  // 4. Delegar a la lógica específica del tipo de aplicación
  switch (options.appType) {
    case 'static':
      generateStaticAppFiles(tree, templateOptions);
      break;
    // Aquí añadiríamos los 'case' para otros appType en el futuro
    // case 'apollo-prisma':
    //   generateApolloPrismaFiles(tree, templateOptions);
    //   break;
    default:
      throw new Error(`Unsupported appType: ${options.appType}`);
  }

  // 5. Formatear archivos modificados/generados
  await formatFiles(tree);

  // (Opcional) Retornar un callback para tareas post-generación, como instalar dependencias
  // return () => {
  //   installPackagesTask(tree);
  // };
}

export default appCreateGenerator;
