#!/bin/bash
# Script para implementar la solución SSH para Docker

# Colores para mejor lectura
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}===== Implementando solución SSH para Docker =====${NC}"

# 1. Verificar que el directorio SSH existe y tiene claves
echo -e "${YELLOW}1. Verificando directorio SSH y claves...${NC}"
if [ ! -d ~/.ssh ]; then
  echo -e "${RED}Error: No se encontró el directorio ~/.ssh${NC}"
  echo -e "Por favor, crea un par de claves SSH con: ssh-keygen -t rsa -b 4096"
  exit 1
fi

# Verificar si tenemos claves SSH
if [ ! -f ~/.ssh/id_rsa ] && [ ! -f ~/.ssh/id_ed25519 ]; then
  echo -e "${RED}No se encontraron claves SSH en ~/.ssh${NC}"
  echo -e "Por favor, crea un par de claves SSH con: ssh-keygen -t rsa -b 4096"
  exit 1
fi

echo -e "${GREEN}✓ Directorio SSH y claves encontradas${NC}"

# 2. Verificar que la clave SSH esté registrada en GitHub
echo -e "${YELLOW}2. Verificar que tu clave SSH esté registrada en GitHub...${NC}"
echo -e "Asegúrate de que la clave pública (id_rsa.pub o id_ed25519.pub) esté registrada en GitHub"
echo -e "Puedes verla con: cat ~/.ssh/id_rsa.pub"

# 3. Crear el Dockerfile.dev con soporte SSH
echo -e "${YELLOW}3. Creando Dockerfile.dev con soporte SSH...${NC}"
mkdir -p apps/miproyecto/app-server
cat > apps/miproyecto/app-server/Dockerfile.dev << 'EOL'
FROM node:22-alpine

WORKDIR /app

# Instalar git, ssh y otras herramientas necesarias
RUN apk add --no-cache git openssh-client bash

# Configurar SSH para GitHub
RUN mkdir -p /root/.ssh && \
    chmod 700 /root/.ssh && \
    echo "Host github.com\n\tStrictHostKeyChecking no\n\tUser git\n" > /root/.ssh/config && \
    chmod 600 /root/.ssh/config

# Copiar package.json y configuración NX
COPY package.json package-lock.json nx.json ./
COPY tsconfig*.json ./

# La clave está en pasar correctamente --host al comando nx serve
CMD ["sh", "-c", "echo 'Iniciando app-server en '$HOST':'$PORT' con interfaces públicas' && npx nx serve miproyecto-app-server --host=0.0.0.0 --port=3000"]
EOL

# 4. Modificar docker-compose.dev.yml para montar .ssh
echo -e "${YELLOW}4. Modificando docker-compose.dev.yml...${NC}"
cat > apps/miproyecto/docker-compose.dev.yml << 'EOL'
services:
  app-server:
    build:
      context: ../../  # Apunta a la raíz del monorepo
      dockerfile: apps/miproyecto/app-server/Dockerfile.dev
    ports:
      - '3000:3000'
    environment:
      - NODE_ENV=development
      - HOST=0.0.0.0  # IMPORTANTE: Escuchar en todas las interfaces
      - PORT=3000
      - DATABASE_URL=postgresql://postgres:postgres@postgres:5432/miproyecto
      - GIT_SSH_COMMAND=ssh -o UserKnownHostsFile=/dev/null -o StrictHostKeyChecking=no
      - NPM_CONFIG_LOGLEVEL=verbose  # Para ayudar a diagnosticar
    volumes:
      - ../../:/app  # Montar todo el monorepo
      - ../../node_modules:/app/node_modules:ro  # Montar node_modules en modo read-only
      - ~/.ssh:/root/.ssh:ro  # Montar claves SSH del host de forma read-only
    networks:
      - app-network
    depends_on:
      - postgres
    deploy:
      resources:
        limits:
          memory: 6G
        reservations:
          memory: 2G
    logging:
      driver: 'json-file'
      options:
        max-size: '10m'
        max-file: '3'

  postgres:
    image: postgres:14-alpine
    environment:
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=postgres
      - POSTGRES_DB=miproyecto
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - '5433:5432' # Usar 5433 externos para evitar conflictos
    networks:
      - app-network
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U postgres']
      interval: 10s
      timeout: 5s
      retries: 5
    logging:
      driver: 'json-file'
      options:
        max-size: '10m'
        max-file: '3'

  pgbouncer:
    image: edoburu/pgbouncer:1.18.0
    environment:
      - DB_USER=postgres
      - DB_PASSWORD=postgres
      - DB_HOST=postgres
      - DB_NAME=miproyecto
      - POOL_MODE=transaction
      - MAX_CLIENT_CONN=100
      - DEFAULT_POOL_SIZE=20
      - ADMIN_USERS=postgres
    ports:
      - '6432:6432'
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - app-network
    healthcheck:
      test:
        ['CMD', 'bash', '-c', "printf \"SHOW LISTS\\n\" | nc localhost 6432"]
      interval: 10s
      timeout: 5s
      retries: 3
    logging:
      driver: 'json-file'
      options:
        max-size: '10m'
        max-file: '3'

  web-app:
    build:
      context: ./web-app
      dockerfile: Dockerfile
    ports:
      - '8080:80'
    volumes:
      - ./web-app/src:/usr/share/nginx/html
      - ./web-app/nginx.conf:/etc/nginx/conf.d/default.conf
    depends_on:
      - app-server
    networks:
      - app-network
    logging:
      driver: 'json-file'
      options:
        max-size: '10m'
        max-file: '3'

  rabbitmq:
    image: rabbitmq:3-management-alpine
    environment:
      - RABBITMQ_DEFAULT_USER=guest
      - RABBITMQ_DEFAULT_PASS=guest
    ports:
      - '5672:5672' # AMQP port
      - '15672:15672' # Management UI
    volumes:
      - rabbitmq_data:/var/lib/rabbitmq
    networks:
      - app-network
    healthcheck:
      test: ['CMD', 'rabbitmq-diagnostics', '-q', 'ping']
      interval: 30s
      timeout: 10s
      retries: 3
    logging:
      driver: 'json-file'
      options:
        max-size: '10m'
        max-file: '3'

  scraper-worker:
    build:
      context: ../../  # Apunta a la raíz del monorepo
      dockerfile: apps/miproyecto/scraper-worker/Dockerfile.dev
    volumes:
      - ../../:/app  # Montar todo el monorepo
      - ../../node_modules:/app/node_modules:ro  # Montar node_modules en modo read-only
      - ~/.ssh:/root/.ssh:ro  # Montar claves SSH del host de forma read-only
    environment:
      - NODE_ENV=development
      - RABBITMQ_URL=amqp://guest:guest@rabbitmq:5672
      - SCRAPER_QUEUE=scraper_tasks
      - SCRAPER_RETRY_QUEUE=scraper_retry
      - SCRAPER_DLQ=scraper_dlq
      - RESULT_QUEUE=result_queue
      - PREFETCH=1
      - MAX_RETRIES=3
      - BACKOFF_MULTIPLIER=2000
      - GRAPHQL_URL=http://app-server:3000/graphql
      - DEBUG=true
      - GIT_SSH_COMMAND=ssh -o UserKnownHostsFile=/dev/null -o StrictHostKeyChecking=no
    networks:
      - app-network
    depends_on:
      - rabbitmq
      - app-server
    deploy:
      resources:
        limits:
          memory: 6G
        reservations:
          memory: 2G
    logging:
      driver: 'json-file'
      options:
        max-size: '10m'
        max-file: '3'
    restart: unless-stopped

networks:
  app-network:
    name: miproyecto-network
    driver: bridge

volumes:
  postgres_data:
  rabbitmq_data:
EOL

# 5. Verificar permisos del directorio .ssh
echo -e "${YELLOW}5. Verificando permisos del directorio SSH...${NC}"
chmod 700 ~/.ssh
chmod 600 ~/.ssh/id_rsa 2>/dev/null || chmod 600 ~/.ssh/id_ed25519 2>/dev/null
chmod 644 ~/.ssh/id_rsa.pub 2>/dev/null || chmod 644 ~/.ssh/id_ed25519.pub 2>/dev/null
chmod 644 ~/.ssh/known_hosts 2>/dev/null || touch ~/.ssh/known_hosts

# 6. Asegurarse de que GitHub está en known_hosts
echo -e "${YELLOW}6. Agregando GitHub a known_hosts...${NC}"
ssh-keyscan github.com >> ~/.ssh/known_hosts 2>/dev/null

# 7. Detener contenedores existentes
echo -e "${YELLOW}7. Deteniendo contenedores existentes...${NC}"
cd apps/miproyecto && docker compose -f docker-compose.dev.yml down

# 8. Reconstruir app-server con la configuración SSH
echo -e "${YELLOW}8. Reconstruyendo app-server con soporte SSH...${NC}"
cd apps/miproyecto && docker compose -f docker-compose.dev.yml build app-server

# 9. Iniciar servicios
echo -e "${YELLOW}9. Iniciando servicios...${NC}"
cd apps/miproyecto && docker compose -f docker-compose.dev.yml up -d postgres rabbitmq
sleep 10
cd apps/miproyecto && docker compose -f docker-compose.dev.yml up -d app-server
sleep 15
cd apps/miproyecto && docker compose -f docker-compose.dev.yml up -d scraper-worker web-app

# 10. Verificar logs
echo -e "${YELLOW}10. Verificando logs de app-server...${NC}"
cd apps/miproyecto && docker compose -f docker-compose.dev.yml logs app-server

# 11. Verificar conectividad
echo -e "${YELLOW}11. Verificando conectividad...${NC}"
echo -e "  Directa:"
curl -v http://localhost:3000/api/hello 2>&1 | grep -v "Connection refused" || echo "No se pudo conectar directamente"
echo -e "  A través de web-app:"
curl -v http://localhost:8080/api/hello 2>&1 | grep -v "Bad Gateway" || echo "No se pudo conectar a través de web-app"

echo -e "${GREEN}===== Implementación Completa =====${NC}"
echo -e "${YELLOW}Si esta solución no funciona, podemos intentar:${NC}"
echo -e "1. Verificar que tu clave SSH tiene acceso al repositorio haiku-generator"
echo -e "2. Configurar un Personal Access Token (PAT) de GitHub en lugar de SSH"
echo -e "3. Modificar temporalmente el package.json para evitar dependencias de GitHub"
