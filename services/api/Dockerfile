FROM node:18-alpine

WORKDIR /app

# Instalar dependencias primero (para aprovechar capa de caché)
COPY package.json package-lock.json* ./
RUN npm install

# Copiar el resto del código
COPY . .

# Variables de entorno
ENV PORT=4000
ENV RABBITMQ_HOST=rabbitmq
ENV RABBITMQ_PORT=5672
ENV RABBITMQ_USER=guest
ENV RABBITMQ_PASSWORD=guest
ENV RABBITMQ_QUEUE=tasks

EXPOSE 4000

CMD ["npm", "start"]