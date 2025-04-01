# Dockerfile.template para aplicaciones App Server

# Etapa 1: Construcción (usando una imagen Node completa para herramientas)
FROM node:22.13.1 AS builder

WORKDIR /app

# Copiar archivos de definición de paquetes y bloqueo PRIMERO
# Aprovecha el cacheo de Docker si estos no cambian
COPY package.json yarn.lock ./
# O descomentar si usas npm:
# COPY package.json package-lock.json ./

# Instalar dependencias (incluyendo devDependencies necesarias para build)
RUN yarn install --frozen-lockfile
# O descomentar si usas npm:
# RUN npm ci

# Copiar el resto del código fuente de la aplicación específica
# Usamos placeholders que el generador NX reemplazará
COPY apps/jupiter/app-server/src ./src
COPY apps/jupiter/app-server/prisma ./prisma
COPY apps/jupiter/app-server/tsconfig.app.json ./tsconfig.app.json
COPY apps/jupiter/app-server/tsconfig.json ./tsconfig.json
# Considera si necesitas copiar tsconfig.base.json desde la raíz u otros archivos comunes

# Ejecutar el build (compilación TypeScript, generación Prisma, etc.)
# Asume que tienes un script 'build' en tu package.json
RUN yarn build
# O descomentar si usas npm:
# RUN npm run build

# (Opcional pero recomendado) Podar dependencias de desarrollo si es posible ANTES de la etapa final
# RUN npm prune --production
# O si usas yarn v1: RUN yarn install --production --ignore-scripts --prefer-offline

# Etapa 2: Producción (usando una imagen Node ligera y limpia)
FROM node:22.13.1-alpine AS production

WORKDIR /app

# Instalar dependencias necesarias en Alpine (ej: cliente postgres, openssl)
# Esto puede variar según las necesidades de tu aplicación y Prisma
# RUN apk add --no-cache libc6-compat openssl postgresql-client

# Crear usuario y grupo no root (¡Buena práctica!)
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copiar dependencias de producción desde la etapa 'builder'
# Si hiciste 'prune' o 'yarn install --production' arriba, esto es más eficiente
COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules
# Si no, copia todo node_modules y asegúrate que el build no necesite devDeps en runtime
# COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules

# Copiar artefactos construidos (ej. directorio 'dist') desde la etapa 'builder'
COPY --from=builder --chown=appuser:appgroup /app/dist ./dist

# Copiar package.json (necesario para scripts npm/yarn start)
COPY --chown=appuser:appgroup package.json .

# Copiar otros assets necesarios en producción (ej. schema de prisma si se usa en runtime)
# Prisma recomienda copiar el schema y el cliente generado
COPY --from=builder --chown=appuser:appgroup /app/prisma ./prisma
# Puede que también necesites el cliente Prisma que se generó en node_modules
# COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Cambiar propiedad del directorio de trabajo
USER appuser

# Exponer el puerto que usa la aplicación
# Puerto por defecto o puedes hacerlo una variable: 4000
EXPOSE 4000

# Comando para iniciar la aplicación (usando el JS compilado en 'dist')
CMD ["node", "dist/main.js"]
# O si tienes un script de producción específico:
# CMD ["yarn", "start:prod"]
# CMD ["npm", "run", "start:prod"]
