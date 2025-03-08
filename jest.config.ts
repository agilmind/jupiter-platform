import { getJestProjectsAsync } from '@nx/jest';

export default async () => ({
  projects: await getJestProjectsAsync(),
  transform: {
    '^.+\\.[tj]sx?$': 'ts-jest',
  },
});
