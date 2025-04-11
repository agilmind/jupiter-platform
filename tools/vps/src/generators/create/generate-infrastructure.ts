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
  } = options;
  const projectNameDashed = names(projectName).fileName;

  const templatesDir = joinPathFragments(__dirname, '..', '..', 'blueprints', 'infrastructure');

  const substitutions = {
    ...options,
    projectName: projectNameDashed,
    tmpl: ''
  };

  const projectTemplateDir = joinPathFragments(templatesDir, 'apps', '__projectName__');
  const projectTargetDir = joinPathFragments('apps', projectNameDashed);

  if (!tree.exists(projectTargetDir)) {
    tree.write(joinPathFragments(projectTargetDir, '.gitkeep'), '');
  }

  const projectFiles = fs.readdirSync(projectTemplateDir);

  projectFiles.forEach(file => {
    const filePath = path.join(projectTemplateDir, file);
    const stats = fs.statSync(filePath);

    const targetFileName = file.endsWith('.template') ? file.slice(0, -'.template'.length) : file;
    const targetFilePath = joinPathFragments(projectTargetDir, targetFileName);

    if (stats.isFile()) {
      if (file.endsWith('.template')) {
        const templateContent = fs.readFileSync(filePath, 'utf8');
        try {
          const processedContent = ejs.render(
            templateContent,
            substitutions,
            { filename: filePath } // Ayuda a EJS a mostrar mejores errores
          );
          tree.write(targetFilePath, processedContent);
        } catch (error) {
          console.error(`ERROR procesando template ${filePath}:`, error);
          throw error;
        }
      } else {
        // Si NO es .template, simplemente copiarlo tal cual
        const content = fs.readFileSync(filePath);
        tree.write(targetFilePath, content);
      }
    }
    else if (stats.isDirectory() && !file.startsWith('__')) {
       console.log(`Skipping directory in manual processing: ${file}`);
    }
  });

  generateFiles(
    tree,
    joinPathFragments(templatesDir, 'vps-infrastructure'),
    joinPathFragments('apps', projectNameDashed, 'vps-infrastructure'),
    substitutions
  );

  for (const dirName of ['bin', 'init-scripts', 'scripts']) {
    generateFiles(
      tree,
      joinPathFragments(templatesDir, 'apps', '__projectName__', dirName),
      joinPathFragments('apps', projectNameDashed, dirName),
      substitutions
    );
  }

  await formatFiles(tree);

  return tree;
}

export default async function (tree: Tree, options: CreateGeneratorSchema) {
  await generateInfrastructure(tree, options);
}
