import { Tree, updateJson } from '@nx/devkit';
import { GeneratorOptions } from './types';

export function registerNxProjects(tree: Tree, options: GeneratorOptions): void {
  const { projectName, projectRoot } = options;

  const projectNames = {};

  if (tree.exists('nx.json')) {
    updateJson(tree, 'nx.json', (json) => {
      if (!json.projects) {
        json.projects = {};
      }

      json.projects[projectName] = {
        tags: [],
        root: `apps/${projectName}`
      };

      return json;
    });
  }

  console.log(`Proyectos registrados:`);
  Object.entries(projectNames).forEach(([key, value]) => {
    console.log(`- ${key}: ${value}`);
  });
}
