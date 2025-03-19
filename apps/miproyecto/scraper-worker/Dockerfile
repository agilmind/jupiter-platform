FROM mcr.microsoft.com/playwright:v1.40.0-jammy

WORKDIR /app

# Copiar package.json
COPY package*.json ./
RUN npm install

# Copiar código fuente
COPY ./src-js ./src-js

EXPOSE 9229

# Ejecutar el script de depuración simple
CMD ["node", "src-js/debug.js"]