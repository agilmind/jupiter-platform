#!/bin/bash
# ===========================================================================
# Script para construir los Dockerfiles base
# ===========================================================================

# Colores para consola
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Obtener directorio del script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"  # Cambio aquí, subimos solo un nivel
PROJECT_NAME="jupiter"

echo -e "${BLUE}==========================================================================${NC}"
echo -e "${BLUE}Construyendo Dockerfiles base para el proyecto ${PROJECT_NAME}${NC}"
echo -e "${BLUE}==========================================================================${NC}"

# Usar nombres de imágenes más simples que cumplan con las convenciones de Docker
NODE_DEV_IMAGE="${PROJECT_NAME}-node-base:dev"
NODE_PROD_IMAGE="${PROJECT_NAME}-node-base:prod"
NGINX_DEV_IMAGE="${PROJECT_NAME}-nginx-base:dev"
NGINX_PROD_IMAGE="${PROJECT_NAME}-nginx-base:prod"

# 1. Construir imágenes base de Node.js
echo -e "${YELLOW}Construyendo imágenes base de Node.js...${NC}"

# Imagen base de Node.js para desarrollo
echo -e "${YELLOW}Construyendo ${NODE_DEV_IMAGE}...${NC}"
docker build -t ${NODE_DEV_IMAGE} \
             -f "$SCRIPT_DIR/Dockerfile.node.base" \
             --target node-dev \
             "$PROJECT_DIR"

if [ $? -ne 0 ]; then
    echo -e "${RED}ERROR: Falló la construcción de ${NODE_DEV_IMAGE}${NC}"
    exit 1
fi

# Imagen base de Node.js para producción
echo -e "${YELLOW}Construyendo ${NODE_PROD_IMAGE}...${NC}"
docker build -t ${NODE_PROD_IMAGE} \
             -f "$SCRIPT_DIR/Dockerfile.node.base" \
             --target node-prod \
             "$PROJECT_DIR"

if [ $? -ne 0 ]; then
    echo -e "${RED}ERROR: Falló la construcción de ${NODE_PROD_IMAGE}${NC}"
    exit 1
fi

# 2. Construir imágenes base de Nginx
echo -e "${YELLOW}Construyendo imágenes base de Nginx...${NC}"

# Imagen base de Nginx para desarrollo
echo -e "${YELLOW}Construyendo ${NGINX_DEV_IMAGE}...${NC}"
docker build -t ${NGINX_DEV_IMAGE} \
             -f "$SCRIPT_DIR/Dockerfile.nginx.base" \
             --target nginx-dev \
             "$PROJECT_DIR"

if [ $? -ne 0 ]; then
    echo -e "${RED}ERROR: Falló la construcción de ${NGINX_DEV_IMAGE}${NC}"
    exit 1
fi

# Imagen base de Nginx para producción
echo -e "${YELLOW}Construyendo ${NGINX_PROD_IMAGE}...${NC}"
docker build -t ${NGINX_PROD_IMAGE} \
             -f "$SCRIPT_DIR/Dockerfile.nginx.base" \
             --target nginx-prod \
             "$PROJECT_DIR"

if [ $? -ne 0 ]; then
    echo -e "${RED}ERROR: Falló la construcción de ${NGINX_PROD_IMAGE}${NC}"
    exit 1
fi

echo -e "${GREEN}Imágenes base construidas con éxito!${NC}"
echo ""
echo "Imágenes disponibles:"
docker images | grep -E "${PROJECT_NAME}-node-base|${PROJECT_NAME}-nginx-base"

echo ""
echo -e "${YELLOW}Ahora puedes ejecutar docker-compose:${NC}"
echo "cd $PROJECT_DIR"
echo "docker-compose -f docker-compose.dev.yml up -d"
