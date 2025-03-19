import { GeneratorOptions } from '../types';

export function dockerfile(options: GeneratorOptions): string {
  return `FROM mcr.microsoft.com/playwright:focal

WORKDIR /app

# Copiar los archivos de proyecto
COPY package*.json ./
RUN npm install    # Cambiado de 'npm ci' a 'npm install'

# Copiar el código fuente
COPY . .

EXPOSE 9229

CMD ["npm", "run", "start"]`;
}
