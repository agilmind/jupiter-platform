import * as path from 'path';
import { AddProjectOptions } from '../../utils/gen-project';
import { ProjectGeneratorSchema } from '../project/schema';

export function configureReact(options: ProjectGeneratorSchema): AddProjectOptions {
  return {
    name: options.name,
    type: 'React',
    projectType: 'app',
    dependencies: {
      prod: [],
      dev: []
    },
    templatePath: path.join(__dirname, '../files/react'),
  };
}
