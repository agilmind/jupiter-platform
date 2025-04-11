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

  const templatesDir = joinPathFragments(__dirname, '..', '..', 'blueprints');

  const substitutions = {
    ...options,
    projectName: projectNameDashed,
    tmpl: ''
  };

  const projectTargetDir = joinPathFragments('apps', projectNameDashed);

  generateFiles(
    tree,
    joinPathFragments(templatesDir),
    joinPathFragments('apps', projectNameDashed),
    substitutions
  );

  await formatFiles(tree);

  return tree;
}

export default async function (tree: Tree, options: CreateGeneratorSchema) {
  await generateInfrastructure(tree, options);
}
