FROM mcr.microsoft.com/playwright:v1.51.1-jammy

WORKDIR /app

# Copiar package.json
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

CMD ["node", "dist/main.js"]