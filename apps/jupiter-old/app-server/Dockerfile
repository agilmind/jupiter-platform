# Dockerfile.template (Rutas de producción corregidas)

# Etapa 1: Construcción
FROM node:22.13.1 AS builder
WORKDIR /app

# Instalar tree para depuración (Podrías quitarlo ahora si quieres)
# RUN apt-get update && apt-get install -y tree && rm -rf /var/lib/apt/lists/*

RUN npm install -g npm@latest

COPY package.json package-lock.json .npmrc nx.json tsconfig.base.json ./
COPY eslint.config.mjs ./

RUN npm ci

COPY apps ./apps
COPY libs ./libs

# Copiar prisma inicial
COPY apps/jupiter/app-server/prisma ./prisma

# Ejecutar el build específico
RUN npx nx build jupiter-app-server

# --- PASOS DE DEPURACIÓN (Puedes quitarlos si confías) ---
# RUN echo ">>> Listing /app contents after build:" && ls -la /app
# RUN echo ">>> Tree view of /app/dist:" && tree /app/dist || echo "/app/dist not found or tree command failed"
# RUN echo ">>> Listing /app/prisma contents after build:" && ls -la /app/prisma || echo "/app/prisma not found (after build)"
# --- FIN PASOS DE DEPURACIÓN ---

# RUN npm prune --omit=dev

# Etapa 2: Producción
FROM node:22.13.1-alpine AS production
WORKDIR /app
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules

# --- Corregir Ruta de Salida (basado en el TREE) ---
COPY --from=builder --chown=appuser:appgroup /app/dist/apps/jupiter/app-server/ ./dist/

COPY --chown=appuser:appgroup package.json .
COPY --from=builder --chown=appuser:appgroup /app/prisma ./prisma

RUN apk add --no-cache curl

USER appuser
EXPOSE 4000
CMD ["node", "dist/src/main.js"]
