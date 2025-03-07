import * as path from 'path';
import { updateProjectConfig } from './apollo-prisma';
import { AddProjectOptions } from '../../utils/gen-project';
import { ProjectGeneratorSchema } from '../project/schema';

export function configureApolloPrisma(options: ProjectGeneratorSchema): AddProjectOptions {
  return {
    name: options.name,
    type: 'Apollo+Prisma',
    projectType: 'service',
    generator: '@nx/node:app',
    dependencies: {
      prod: ['@apollo/server', 'graphql', '@prisma/client'],
      dev: ['prisma']
    },
    templatePath: path.join(__dirname, '../files/apollo-prisma'),
    projectUpdates: updateProjectConfig  // Función específica para Apollo+Prisma
  };
}
