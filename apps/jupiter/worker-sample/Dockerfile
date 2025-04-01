# Dockerfile para worker en producción
# Versión corregida con nombres de imágenes válidos

# Etapa de construcción
FROM jupiter-node-base:dev AS builder

WORKDIR /app

# Configurar npm para mayor resiliencia
RUN npm config set fetch-retry-mintimeout 20000 \
    && npm config set fetch-retry-maxtimeout 120000 \
    && npm config set fetch-retries 5 \
    && npm config set registry https://registry.npmjs.org/

# Crear archivo .npmrc para prevenir problemas con repositorios privados
RUN echo "registry=https://registry.npmjs.org/" > .npmrc

# Copiar package.json para modificarlo
COPY package.json ./

# Eliminar dependencias problemáticas
RUN node -e "const fs=require('fs'); \
    const pkg=JSON.parse(fs.readFileSync('./package.json')); \
    if(pkg.dependencies) { delete pkg.dependencies['haiku-generator']; } \
    if(pkg.devDependencies) { delete pkg.devDependencies['haiku-generator']; } \
    fs.writeFileSync('./package.json', JSON.stringify(pkg, null, 2));"

# Copiar archivos necesarios para la compilación
COPY package-lock.json ./
COPY tsconfig.base.json ./
COPY apps/jupiter/tsconfig.json ./apps/jupiter/
COPY apps/jupiter/worker-sample/ ./apps/jupiter/worker-sample/

# Instalar dependencias con reintentos
RUN for i in 1 2 3 4 5; do \
        echo "=== Intento $i de instalación de dependencias ==="; \
        npm install --no-package-lock --no-audit --no-fund --omit=optional --ignore-scripts && break || \
        echo "=== Intento $i falló, esperando antes de reintentar... ==="; \
        sleep 15; \
    done

# Compilar TypeScript
WORKDIR /app/apps/jupiter/worker-sample
RUN echo "Compilando TypeScript para worker-sample..."
RUN npx tsc -p tsconfig.json

# Etapa de producción
FROM jupiter-node-base:prod

WORKDIR /app

# Identificar el servicio
ENV SERVICE_TYPE="worker"
ENV SERVICE_NAME="worker-sample"
ENV NODE_ENV="production"

# Copiar dependencias de producción
COPY --from=builder /app/node_modules ./node_modules

# Copiar archivos compilados
COPY --from=builder /app/dist/compiled/worker-sample ./worker

# Configurar variables de entorno
ENV HOST=0.0.0.0
ENV RABBITMQ_HOST=jupiter-rabbitmq
ENV APP_SERVER_HOST=jupiter-app-server
ENV APP_SERVER_PORT=4000
ENV WORKER_JS_PATH=/app/worker/apps/jupiter/worker-sample/src/main.js

# Usar el script de inicio unificado
CMD ["/usr/local/bin/start-service.sh"]
