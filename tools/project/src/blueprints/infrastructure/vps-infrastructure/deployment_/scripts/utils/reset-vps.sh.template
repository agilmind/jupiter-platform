# Script de limpieza completa
cat > /tmp/clean_everything.sh << 'EOF'
#!/bin/bash
# Script para eliminar completamente todo lo relacionado con jupiter

# Colores para consola
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

PROJECT_NAME="jupiter"

echo -e "${RED}===========================================================${NC}"
echo -e "${RED}ADVERTENCIA: Este script eliminará TODAS las configuraciones${NC}"
echo -e "${RED}===========================================================${NC}"
echo -e "${YELLOW}Se eliminarán:${NC}"
echo -e "- Todos los contenedores Docker"
echo -e "- Todas las imágenes Docker"
echo -e "- Todos los volúmenes Docker"
echo -e "- Todas las redes personalizadas"
echo -e "- El directorio /opt/$PROJECT_NAME"
echo -e "- Las configuraciones de Nginx relacionadas"

read -p "¿Estás SEGURO de que quieres continuar? (escribe 'yes' para confirmar): " CONFIRM
if [[ "$CONFIRM" != "yes" ]]; then
    echo -e "${YELLOW}Operación cancelada.${NC}"
    exit 0
fi

# 1. Detener y eliminar todos los contenedores
echo -e "${YELLOW}Deteniendo y eliminando contenedores...${NC}"
if docker ps -a -q &>/dev/null; then
    docker stop $(docker ps -a -q) || true
    docker rm $(docker ps -a -q) || true
    echo -e "${GREEN}✅ Contenedores eliminados${NC}"
else
    echo -e "${YELLOW}No hay contenedores para eliminar${NC}"
fi

# 2. Eliminar todas las imágenes
echo -e "${YELLOW}Eliminando imágenes Docker...${NC}"
if docker images -q &>/dev/null; then
    docker rmi -f $(docker images -a -q) || true
    echo -e "${GREEN}✅ Imágenes eliminadas${NC}"
else
    echo -e "${YELLOW}No hay imágenes para eliminar${NC}"
fi

# 3. Eliminar todos los volúmenes
echo -e "${YELLOW}Eliminando volúmenes Docker...${NC}"
if docker volume ls -q &>/dev/null; then
    docker volume rm $(docker volume ls -q) || true
    echo -e "${GREEN}✅ Volúmenes eliminados${NC}"
else
    echo -e "${YELLOW}No hay volúmenes para eliminar${NC}"
fi

# 4. Eliminar redes personalizadas
echo -e "${YELLOW}Eliminando redes personalizadas...${NC}"
for network in $(docker network ls --filter type=custom -q); do
    docker network rm $network || true
done
echo -e "${GREEN}✅ Redes personalizadas eliminadas${NC}"

# 5. Limpiar sistema Docker
echo -e "${YELLOW}Limpiando sistema Docker...${NC}"
docker system prune -af --volumes
echo -e "${GREEN}✅ Sistema Docker limpiado${NC}"

# 6. Eliminar directorio del proyecto
echo -e "${YELLOW}Eliminando directorio del proyecto...${NC}"
if [ -d "/opt/$PROJECT_NAME" ]; then
    sudo rm -rf "/opt/$PROJECT_NAME"
    echo -e "${GREEN}✅ Directorio del proyecto eliminado${NC}"
else
    echo -e "${YELLOW}Directorio del proyecto no encontrado${NC}"
fi

# 7. Eliminar configuraciones de Nginx
echo -e "${YELLOW}Eliminando configuraciones de Nginx...${NC}"
sudo rm -f /etc/nginx/conf.d/$PROJECT_NAME.ar.conf
sudo rm -f /etc/nginx/conf.d/webapp.$PROJECT_NAME.ar.conf
sudo rm -f /etc/nginx/conf.d/grafana.conf
sudo rm -f /etc/nginx/conf.d/prometheus.conf
sudo rm -f /etc/nginx/conf.d/alertmanager.conf
sudo rm -f /etc/nginx/conf.d/ssl-params.conf
sudo rm -f /etc/nginx/conf.d/ssl-params-$PROJECT_NAME.conf
sudo rm -f /etc/nginx/conf.d/cache-zones.conf
sudo rm -f /etc/nginx/conf.d/cache-zones-$PROJECT_NAME.conf

# 8. Recargar Nginx
echo -e "${YELLOW}Recargando configuración de Nginx...${NC}"
sudo nginx -t && sudo systemctl reload nginx

echo -e "${GREEN}===========================================================${NC}"
echo -e "${GREEN}Limpieza completa realizada${NC}"
echo -e "${GREEN}===========================================================${NC}"
echo -e "${YELLOW}Ahora puedes realizar una instalación limpia de hybrid${NC}"
EOF

chmod +x /tmp/clean_everything.sh
sudo /tmp/clean_everything.sh
