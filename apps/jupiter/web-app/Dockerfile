# Dockerfile para web-app en producción
# Versión corregida con nombres de imágenes válidos

# Etapa de construcción
FROM jupiter-node-base:dev AS builder

WORKDIR /app

# Preparar directorios para los package.json
RUN mkdir -p ./apps/jupiter/web-app \
    ./libs/jupiter/shared \
    ./libs/jupiter/api-interfaces

# Copiar package.json de la aplicación y el proyecto
COPY package.json package-lock.json ./
COPY apps/jupiter/web-app/package.json ./apps/jupiter/web-app/

# Copiar package.json de las libs usando file-utils
RUN /usr/local/bin/file-utils.sh copy-if-exists libs/jupiter/shared/package.json ./libs/jupiter/shared/
RUN /usr/local/bin/file-utils.sh copy-if-exists libs/jupiter/api-interfaces/package.json ./libs/jupiter/api-interfaces/

# Eliminar dependencias problemáticas
RUN node -e "const fs=require('fs'); \
    const pkg=JSON.parse(fs.readFileSync('./package.json')); \
    if(pkg.dependencies && pkg.dependencies['haiku-generator']) delete pkg.dependencies['haiku-generator']; \
    if(pkg.devDependencies && pkg.devDependencies['haiku-generator']) delete pkg.devDependencies['haiku-generator']; \
    fs.writeFileSync('./package.json', JSON.stringify(pkg, null, 2));"

# Instalar todas las dependencias para poder construir
RUN npm install

# Copiar archivos de configuración y código fuente
COPY tsconfig.base.json ./
COPY apps/jupiter/tsconfig.json ./apps/jupiter/
COPY apps/jupiter/web-app ./apps/jupiter/web-app/

# Copiar libs compartidas usando file-utils
RUN /usr/local/bin/file-utils.sh copy-files "libs/jupiter/shared/*" "./libs/jupiter/shared/"
RUN /usr/local/bin/file-utils.sh copy-files "libs/jupiter/api-interfaces/*" "./libs/jupiter/api-interfaces/"

# Construir la aplicación con Vite
WORKDIR /app/apps/jupiter/web-app
RUN npx vite build --outDir /app/dist

# Etapa de producción - Nginx
FROM jupiter-nginx-base:prod

# Identificar el servicio
ENV SERVICE_TYPE="web-app"
ENV SERVICE_NAME="web-app"
ENV NODE_ENV="production"

# Copiar los archivos estáticos construidos
COPY --from=builder /app/dist /usr/share/nginx/html

# Copiar configuración de Nginx
COPY apps/jupiter/web-app/nginx.conf /etc/nginx/conf.d/default.conf.template

# Configurar variables de entorno
ENV APP_SERVER_HOST=jupiter-app-server
ENV APP_SERVER_PORT=4000
ENV SERVER_PORT=4000

# Configurar healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost/health || exit 1

# Exponer puerto
EXPOSE 80

# Iniciar Nginx
CMD ["/usr/local/bin/start-service.sh"]
