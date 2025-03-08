import * as path from 'path';
import { ProjectGeneratorSchema } from '../project/schema';
import { AddProjectOptions } from '../../utils/gen-project';

export function configureReactNative(options: ProjectGeneratorSchema): AddProjectOptions {
  return {
    name: options.name,
    type: 'ReactNative',
    projectType: 'app',
    dependencies: {
      prod: [],
      dev: []
    },
    templatePath: path.join(__dirname, '../files/react-native'),
  };
}
