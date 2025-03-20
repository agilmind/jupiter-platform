FROM mcr.microsoft.com/playwright:v1.40.0-jammy

WORKDIR /app

# Copiar package.json y package-lock.json
COPY package*.json ./
RUN npm install

# Copiar archivos de configuración TypeScript
COPY tsconfig*.json ./

# Asegurar que existe el directorio para tipos personalizados
RUN mkdir -p ./src/types

# Copiar código fuente
COPY ./src ./src

# Compilar TypeScript a JavaScript
RUN npx tsc --skipLibCheck

EXPOSE 9229

# Ejecutar la versión compilada
CMD ["node", "dist/main.js"]
