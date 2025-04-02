# Dockerfile.template (Añadiendo listados para depuración)

# Etapa 1: Construcción
FROM node:22.13.1 AS builder
WORKDIR /app

RUN npm install -g npm@latest

COPY package.json package-lock.json .npmrc nx.json tsconfig.base.json ./
COPY eslint.config.mjs ./

RUN npm ci

COPY apps ./apps
COPY libs ./libs
COPY tsconfig.base.json ./

# Ejecutar el build específico
RUN npx nx build jupiter-app-server

# --- PASOS DE DEPURACIÓN ---
RUN echo ">>> Listing /app contents after build:" && ls -la /app
RUN echo ">>> Listing /app/dist contents:" && ls -la /app/dist
RUN echo ">>> Listing /app/dist/apps contents (if dist exists):" && ls -la /app/dist/apps || echo "/app/dist/apps not found"
RUN echo ">>> Listing /app/prisma contents:" && ls -la /app/prisma || echo "/app/prisma not found"
# --- FIN PASOS DE DEPURACIÓN ---

# Comentar temporalmente si es necesario depurar
# RUN npm prune --omit=dev

# Etapa 2: Producción
FROM node:22.13.1-alpine AS production
WORKDIR /app
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules

# Usa la ruta que crees correcta según project.json (la verificaremos con los logs)
COPY --from=builder --chown=appuser:appgroup /app/dist/apps/jupiter-app-server ./dist

COPY --chown=appuser:appgroup package.json .
# Usa la ruta que debería ser correcta
COPY --from=builder --chown=appuser:appgroup /app/prisma ./prisma

USER appuser
EXPOSE 4000
CMD ["node", "dist/main.js"]
