FROM node:18-alpine AS builder

WORKDIR /app

# Copiar package.json y archivos de dependencias
COPY package.json package-lock.json* ./
COPY nx.json tsconfig.base.json ./

# Instalar dependencias
RUN npm ci

# Copiar código fuente (solo lo necesario)
COPY libs/worker-framework libs/worker-framework
COPY apps/scraper-anses apps/scraper-anses

# Compilar la aplicación
RUN npx nx build scraper-anses

# Etapa de producción
FROM node:18-alpine

WORKDIR /app

# Copiar solo los archivos necesarios
COPY --from=builder /app/dist/apps/scraper-anses ./
COPY --from=builder /app/package.json ./

# Instalar solo dependencias de producción
RUN npm ci --production && \
    npm cache clean --force

# Variables de entorno
ENV NODE_ENV=production

# Usuario no-root para mejor seguridad
USER node

CMD ["node", "main.js"]