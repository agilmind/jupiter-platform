import {
  GeneratorCallback,
  Tree,
  formatFiles,
  generateFiles,
  joinPathFragments,
  names,
  getWorkspaceLayout,
} from '@nx/devkit';
import { ProjectGeneratorSchema } from './schema';
import * as path from 'path';

interface NormalizedSchema extends ProjectGeneratorSchema {
  projectName: string;
  projectRoot: string;
  projectDirectory: string;
  projectTitle: string; // Added projectTitle
  parsedTags: string[];
}

function normalizeOptions(
  tree: Tree,
  options: ProjectGeneratorSchema
): NormalizedSchema {
  const name = names(options.projectName).fileName;
  const projectDirectory = options.projectName; // Usamos projectName como directorio directamente
  const projectName = projectDirectory.replace(new RegExp('/', 'g'), '-');
  const projectRoot = joinPathFragments(
    getWorkspaceLayout(tree).appsDir,
    projectDirectory
  );
  const parsedTags = options.tags ? options.tags.split(',').map((s) => s.trim()) : [];

  return {
    ...options,
    projectName,
    projectRoot,
    projectDirectory,
    parsedTags,
    projectTitle: names(options.projectName).className, // Calculate projectTitle
  };
}

export async function projectGenerator(
  tree: Tree,
  options: ProjectGeneratorSchema
): Promise<GeneratorCallback> {
  const normalizedOptions = normalizeOptions(tree, options);

  // Generate project files from templates
  generateFiles(
    tree,
    path.join(__dirname, 'files'), // Path to the files templates
    normalizedOptions.projectRoot, // Destination directory (apps/<projectName>)
    {
      ...normalizedOptions, // Options (projectName, projectTitle, etc.)
      ...names(normalizedOptions.projectName), // More name utilities
      template: '', // Workaround for NX bug
    }
  );

  await formatFiles(tree);
  return () => {
    // Run tasks if needed
  };
}

export default projectGenerator;
