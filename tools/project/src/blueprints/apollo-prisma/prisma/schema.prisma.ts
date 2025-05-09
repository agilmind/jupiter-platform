import { GeneratorOptions } from '../../types';

export function prismaSchema(options: GeneratorOptions): string {
  return `// This is your Prisma schema file,
// learn more about it in the docs: https://pris.ly/d/prisma-schema

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Check {
  id        String   @id
  status    String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  flow      Json[]
  result    String?
}
`;
}
