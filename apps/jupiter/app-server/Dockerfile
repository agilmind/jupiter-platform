# Dockerfile.template para aplicaciones App Server (con manejo de npm y devDeps)

# Etapa 1: Construcción
FROM node:22.13.1 AS builder
WORKDIR /app

RUN npm install -g npm@latest

# Copiar archivos de definición de paquetes y bloqueo PRIMERO desde la RAÍZ
COPY package.json package-lock.json ./
COPY .npmrc ./

# Instalar TODAS las dependencias (incluyendo dev) necesarias para el build
RUN npm ci

# Copiar código fuente de la aplicación específica y archivos de config necesarios para build
COPY apps/jupiter/app-server/src ./src
COPY apps/jupiter/app-server/prisma ./prisma
COPY apps/jupiter/app-server/tsconfig.app.json ./tsconfig.app.json
COPY apps/jupiter/app-server/tsconfig.json ./tsconfig.json
# COPY tsconfig.base.json ./ # Si es necesario

# Ejecutar el build
RUN npm run build

# Podar devDependencies (esto eliminará haiku-generator)
RUN npm prune --omit=dev

# Etapa 2: Producción
FROM node:22.13.1-alpine AS production
WORKDIR /app

# --- Actualizar NPM dentro del contenedor ---
RUN npm install -g npm@latest # O la versión específica >=11.2.0

# Instalar dependencias Alpine necesarias en runtime (ej. cliente postgres)
# RUN apk add --no-cache libc6-compat openssl postgresql-client

# Crear usuario y grupo no root
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# --- Si usaste Opción A (npm prune) arriba ---
COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --chown=appuser:appgroup package.json .
# --- Fin Opción A ---

# --- Opción B: Reinstalar solo producción (Alternativa a Opción A) ---
# COPY --chown=appuser:appgroup package.json package-lock.json ./
# RUN npm ci --omit=dev
# --- Fin Opción B ---

# Copiar artefactos construidos
COPY --from=builder --chown=appuser:appgroup /app/dist ./dist

# Copiar assets de producción (prisma)
COPY --from=builder --chown=appuser:appgroup /app/prisma ./prisma
# COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Cambiar usuario
USER appuser

# Exponer puerto
EXPOSE 4000

# Comando de inicio
CMD ["node", "dist/main.js"]
