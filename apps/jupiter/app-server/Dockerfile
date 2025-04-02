# Etapa 1: Construcción
FROM node:22.13.1 AS builder
WORKDIR /app

RUN npm install -g npm@latest

# Copiar archivos de configuración y manifiestos raíz
COPY package.json package-lock.json .npmrc nx.json tsconfig.base.json ./
COPY eslint.config.mjs ./

# Instalar dependencias
RUN npm ci

# Copiar el código fuente de apps y libs
COPY apps ./apps
COPY libs ./libs

# --- Ejecutar el build específico para app-server ---
RUN npx nx build jupiter-app-server

# --- Comentar temporalmente para depurar si es necesario ---
# RUN npm prune --omit=dev
# --- Fin comentario temporal ---

# Etapa 2: Producción
FROM node:22.13.1-alpine AS production
WORKDIR /app

# --- Actualizar NPM dentro del contenedor ---
RUN npm install -g npm@latest # O la versión específica >=11.2.0

# Crear usuario y grupo no root
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copiar dependencias (considera si prune estaba comentado)
COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules

# --- Copiar la salida del build específico ---
# La ruta de salida de NX suele ser dist/apps/nombre-proyecto
# Verifica la opción 'outputPath' en el target 'build' de project.json
COPY --from=builder --chown=appuser:appgroup /app/dist/apps/jupiter-app-server ./dist

# Copiar package.json y prisma
COPY --chown=appuser:appgroup package.json .
COPY --from=builder --chown=appuser:appgroup /app/apps/jupiter-app-server/prisma ./prisma # Ajusta ruta si es necesario

USER appuser
EXPOSE 4000
CMD ["node", "dist/main.js"]
