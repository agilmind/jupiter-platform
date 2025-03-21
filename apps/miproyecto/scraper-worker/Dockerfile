FROM node:18-alpine AS development

WORKDIR /app

# Copiar package.json y nx.json
COPY package.json package-lock.json nx.json ./

# Copiar configuración de TypeScript y proyectos
COPY tsconfig*.json ./
COPY libs libs/
COPY apps apps/

# Instalar dependencias
RUN npm ci

# Para debugging:
ENV NODE_OPTIONS="--inspect=0.0.0.0:9229"

# No necesitamos construir para desarrollo ya que usaremos volumes
# El comando se reemplazará en docker-compose
CMD ["npx", "nx", "serve", "miproyecto-scraper-worker"]
