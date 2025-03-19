import { GeneratorOptions } from '../types';

export function dockerfile(options: GeneratorOptions): string {
  return `FROM mcr.microsoft.com/playwright:focal

WORKDIR /app

# Copiar los archivos de proyecto
COPY package*.json ./
RUN npm ci

# Copiar el código fuente
COPY . .

# No necesitamos instalar browsers ya que la imagen de playwright ya los trae
# RUN npx playwright install --with-deps chromium

EXPOSE 9229

CMD ["npm", "run", "start"]`;
}
