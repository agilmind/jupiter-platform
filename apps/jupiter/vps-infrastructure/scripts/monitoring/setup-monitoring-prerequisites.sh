#!/bin/bash
# Script para configurar los prerrequisitos del monitoreo (simplificado)
# Versión: 1.1
# Este script debe ejecutarse ANTES de copiar los archivos de configuración Nginx

set -e  # Exit on error

# Colores para output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

PROJECT_NAME="jupiter"

echo -e "${BLUE}==========================================================${NC}"
echo -e "${BLUE}Configurando prerrequisitos para el monitoreo${NC}"
echo -e "${BLUE}==========================================================${NC}"

# Verificar si estamos ejecutando como root o con sudo
if [ "$(id -u)" -ne 0 ]; then
    echo -e "${RED}Este script debe ejecutarse como root o con sudo${NC}"
    exit 1
fi

# Verificar que Nginx está instalado
if ! command -v nginx &> /dev/null; then
    echo -e "${RED}Error: Nginx no está instalado${NC}"
    exit 1
fi

# Verificar directorio de configuración Nginx
NGINX_CONF_DIR="/etc/nginx/conf.d"
if [ ! -d "$NGINX_CONF_DIR" ]; then
    echo -e "${RED}Error: Directorio de configuración de Nginx no encontrado${NC}"
    exit 1
fi

# Crear o actualizar configuración de caché
NGINX_CACHE_CONF="$NGINX_CONF_DIR/cache-zones-$PROJECT_NAME.conf"
echo -e "${YELLOW}Creando configuración de caché: $NGINX_CACHE_CONF${NC}"
cat > "$NGINX_CACHE_CONF" << EOF
# Definición de zonas de caché para $PROJECT_NAME
proxy_cache_path /var/cache/nginx/$PROJECT_NAME levels=1:2 keys_zone=${PROJECT_NAME}_cache:10m max_size=1g inactive=60m use_temp_path=off;
EOF
echo -e "${GREEN}Archivo cache-zones-$PROJECT_NAME.conf creado${NC}"

# Crear directorio de caché si no existe
mkdir -p /var/cache/nginx/$PROJECT_NAME
chown -R www-data:www-data /var/cache/nginx

echo -e "${GREEN}==========================================================${NC}"
echo -e "${GREEN}Prerrequisitos configurados correctamente${NC}"
echo -e "${GREEN}==========================================================${NC}"
echo ""
echo -e "${YELLOW}Ahora puede continuar con la configuración de Nginx:${NC}"
echo -e "sudo cp ./nginx/conf.d/*.conf /etc/nginx/conf.d/"
echo -e "sudo nginx -t && sudo systemctl reload nginx"
echo -e ""
echo -e "${YELLOW}Y luego configurar la autenticación:${NC}"
echo -e "sudo ./setup-monitoring-auth.sh"
