export type ProjectTypes = 'apollo-prisma' | 'react' | 'react-native';

export interface ProjectGeneratorSchema {
  name: string;
  type: ProjectTypes;
  update?: boolean;
}
