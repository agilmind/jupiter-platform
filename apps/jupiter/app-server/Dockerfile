# Etapa 1: Construcción
FROM node:22.13.1 AS builder
WORKDIR /app

RUN npm install -g npm@latest

COPY package.json package-lock.json .npmrc nx.json tsconfig.base.json ./
COPY eslint.config.mjs ./

RUN npm ci

COPY apps ./apps
COPY libs ./libs

# Ejecutar el build específico
RUN npx nx build jupiter-app-server

# Comentar temporalmente si es necesario depurar
# RUN npm prune --omit=dev

# Etapa 2: Producción
FROM node:22.13.1-alpine AS production
WORKDIR /app

# --- Actualizar NPM dentro del contenedor ---
RUN npm install -g npm@latest # O la versión específica >=11.2.0

# Crear usuario y grupo no root
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copiar dependencias (revisar si prune está comentado)
COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules

# --- Corregir Ruta de Salida ---
# Reemplaza 'dist/apps/...' con el valor REAL de 'outputPath' en project.json
COPY --from=builder --chown=appuser:appgroup /app/dist/apps/jupiter-app-server ./dist

# Copiar package.json y prisma
COPY --chown=appuser:appgroup package.json .
COPY --from=builder --chown=appuser:appgroup /app/prisma ./prisma

USER appuser
EXPOSE 4000
CMD ["node", "dist/main.js"]
