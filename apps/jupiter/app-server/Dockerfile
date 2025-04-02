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
# Copiar libs si existe
COPY libs ./libs
COPY tsconfig.base.json ./

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

# Copiar dependencias (revisar si prune está comentado)
COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules

# --- Corregir Ruta de Salida y Quitar Comentario ---
# Copia el CONTENIDO de la salida del build a ./dist en la imagen final
COPY --from=builder --chown=appuser:appgroup /app/dist/apps/jupiter-app-server/ ./dist/

# Copiar package.json y prisma
COPY --chown=appuser:appgroup package.json .
# Usar la ruta que debería ser correcta
COPY --from=builder --chown=appuser:appgroup /app/prisma ./prisma

USER appuser
EXPOSE 4000
# Ajustar CMD si tu main.js no está directamente en dist
CMD ["node", "dist/src/main.js"] # O simplemente "dist/main.js" si tsc aplana la estructura src
