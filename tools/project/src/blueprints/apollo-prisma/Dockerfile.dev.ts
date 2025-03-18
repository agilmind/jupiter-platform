import { GeneratorOptions } from '../types';

export function dockerfileDev(options: GeneratorOptions): string {
  return `FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev"]`;
}
