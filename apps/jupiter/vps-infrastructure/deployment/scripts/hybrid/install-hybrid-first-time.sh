#!/bin/bash
# Script para realizar la instalación completa de configuración hybrid
# Este script debe ejecutarse en el servidor después de transferir todos los archivos
# Generado automáticamente por el generador de proyectos
# Versión: 1.0

set -e  # Exit on error

# Colores para output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Configuración
PROJECT_NAME="jupiter"
DEPLOY_PATH="/opt/$PROJECT_NAME"  # Ruta donde se desplegará

echo -e "${BLUE}===========================================================${NC}"
echo -e "${BLUE}Instalación completa de $PROJECT_NAME (configuración Hybrid)${NC}"
echo -e "${BLUE}===========================================================${NC}"

# Verificar que se ejecuta desde el directorio correcto
if [ "$(pwd)" != "$DEPLOY_PATH" ]; then
  echo -e "${RED}Error: Este script debe ejecutarse desde $DEPLOY_PATH${NC}"
  echo -e "${YELLOW}Ejecuta: cd $DEPLOY_PATH${NC}"
  exit 1
fi

# Verificar que existe el archivo de imágenes Docker
if [ ! -f "$PROJECT_NAME-images.tar" ]; then
  echo -e "${RED}Error: No se encontró el archivo de imágenes $PROJECT_NAME-images.tar${NC}"
  echo -e "${YELLOW}Asegúrate de haber transferido el archivo de imágenes.${NC}"
  exit 1
fi

# 1. Cargar imágenes Docker
echo -e "${YELLOW}Paso 1: Cargando imágenes Docker...${NC}"
docker load -i $PROJECT_NAME-images.tar
echo -e "${GREEN}✅ Imágenes cargadas correctamente${NC}"

# 2. Detener servicios existentes (si hay alguno)
echo -e "${YELLOW}Paso 2: Deteniendo servicios existentes si los hay...${NC}"
docker compose down 2>/dev/null || true
echo -e "${GREEN}✅ Servicios detenidos o no existían${NC}"

# 3. Iniciar servicios principales (sin monitoreo)
echo -e "${YELLOW}Paso 3: Iniciando servicios principales...${NC}"
# Verificar el contenido del docker-compose.yml
echo -e "${YELLOW}Verificando archivo docker-compose.yml...${NC}"
if ! docker compose config > /dev/null; then
  echo -e "${RED}❌ Error en el archivo docker-compose.yml${NC}"
  echo -e "${YELLOW}Detalles del error:${NC}"
  docker compose config
  exit 1
fi

# Iniciar los contenedores
docker compose up -d
echo -e "${GREEN}✅ Servicios principales iniciados${NC}"

# 4. Configurar prerrequisitos para monitoreo
echo -e "${YELLOW}Paso 4: Configurando prerrequisitos para monitoreo...${NC}"
sudo ./setup-monitoring-prerequisites.sh
echo -e "${GREEN}✅ Prerrequisitos configurados${NC}"

# 5. Iniciar servicios de monitoreo
echo -e "${YELLOW}Paso 5: Iniciando servicios de monitoreo...${NC}"
# Verificar el contenido del docker-compose.monitoring.yml
echo -e "${YELLOW}Verificando archivo docker-compose.monitoring.yml...${NC}"
if ! docker compose -f docker-compose.monitoring.yml config > /dev/null; then
  echo -e "${RED}❌ Error en el archivo docker-compose.monitoring.yml${NC}"
  echo -e "${YELLOW}Detalles del error:${NC}"
  docker compose -f docker-compose.monitoring.yml config
  exit 1
fi

# Iniciar los contenedores de monitoreo
docker compose -f docker-compose.monitoring.yml up -d
echo -e "${GREEN}✅ Servicios de monitoreo iniciados${NC}"

# 6. Verificar que los contenedores estén en ejecución antes de configurar Nginx
echo -e "${YELLOW}Paso 6: Verificando que los contenedores estén en ejecución...${NC}"
# Verificar servicios principales
if [ $(docker compose ps -q | wc -l) -eq 0 ]; then
  echo -e "${RED}❌ Los servicios principales no están en ejecución${NC}"
  echo -e "${YELLOW}Verifica los logs:${NC}"
  docker compose logs
  exit 1
fi

# Verificar servicios de monitoreo
if [ $(docker compose -f docker-compose.monitoring.yml ps -q | wc -l) -eq 0 ]; then
  echo -e "${RED}❌ Los servicios de monitoreo no están en ejecución${NC}"
  echo -e "${YELLOW}Verifica los logs:${NC}"
  docker compose -f docker-compose.monitoring.yml logs
  exit 1
fi

echo -e "${GREEN}✅ Todos los contenedores están en ejecución${NC}"

# 7. Configurar Nginx ahora que los contenedores están en ejecución
echo -e "${YELLOW}Paso 7: Configurando Nginx...${NC}"
sudo cp ./nginx/conf.d/*.conf /etc/nginx/conf.d/
sudo nginx -t && sudo systemctl reload nginx
if [ $? -eq 0 ]; then
  echo -e "${GREEN}✅ Nginx configurado correctamente${NC}"
else
  echo -e "${RED}❌ Error en la configuración de Nginx${NC}"
  echo -e "${YELLOW}Contenedores en ejecución:${NC}"
  docker ps | grep $PROJECT_NAME

  echo -e "${YELLOW}Verificando contenido de archivos de configuración de Nginx:${NC}"
  ls -la ./nginx/conf.d/
  cat ./nginx/conf.d/*.conf | grep upstream

  echo -e "${RED}La configuración de Nginx falló. Por favor, verifica manualmente los contenedores y la configuración.${NC}"
  exit 1
fi

# 8. Configurar SSL (opcional)
echo -e "${YELLOW}Paso 8: ¿Deseas configurar SSL ahora? (y/n)${NC}"
read -p "> " CONFIGURE_SSL
if [[ "$CONFIGURE_SSL" == "y" || "$CONFIGURE_SSL" == "Y" ]]; then
  echo -e "${YELLOW}Configurando SSL...${NC}"
  sudo ./setup-ssl.sh
  echo -e "${GREEN}✅ SSL configurado${NC}"
else
  echo -e "${YELLOW}Configuración de SSL omitida. Puedes ejecutarla más tarde con:${NC}"
  echo -e "sudo ./setup-ssl.sh"
fi

# 9. Configurar autenticación para monitoreo
echo -e "${YELLOW}Paso 9: Configurando autenticación para herramientas de monitoreo...${NC}"
sudo ./setup-monitoring-auth.sh
echo -e "${GREEN}✅ Autenticación configurada${NC}"

# 10. Establecer modo de monitoreo
echo -e "${YELLOW}Paso 10: Estableciendo modo de monitoreo...${NC}"
echo -e "${YELLOW}Selecciona el modo de monitoreo:${NC}"
echo -e "1. Completo (más recursos, retención larga)"
echo -e "2. Ligero (menos recursos, retención corta)"
read -p "> " MONITORING_MODE_CHOICE

if [ "$MONITORING_MODE_CHOICE" == "1" ]; then
  ./setup-monitoring-mode.sh full
  echo -e "${GREEN}✅ Modo de monitoreo completo configurado${NC}"
else
  ./setup-monitoring-mode.sh light
  echo -e "${GREEN}✅ Modo de monitoreo ligero configurado${NC}"
fi

# 11. Verificar estado final
echo -e "${YELLOW}Paso 11: Verificando estado final...${NC}"
echo -e "${YELLOW}Servicios principales:${NC}"
docker compose ps
echo -e "${YELLOW}Servicios de monitoreo:${NC}"
docker compose -f docker-compose.monitoring.yml ps

echo -e "${GREEN}===========================================================${NC}"
echo -e "${GREEN}¡Instalación completa finalizada!${NC}"
echo -e "${GREEN}===========================================================${NC}"
echo ""
echo -e "${YELLOW}Verifica que los siguientes servicios estén disponibles:${NC}"
echo -e "- Frontend: https://$PROJECT_NAME.ar"
echo -e "- API: https://$PROJECT_NAME.ar/api"
echo -e "- RabbitMQ Admin: https://$PROJECT_NAME.ar/rabbitmq"
echo -e "- Grafana: https://grafana.vps.$PROJECT_NAME.ar"
echo -e "- Prometheus: https://prometheus.vps.$PROJECT_NAME.ar"
echo -e "- AlertManager: https://alertmanager.vps.$PROJECT_NAME.ar"
echo ""
echo -e "${YELLOW}¡Importante! Asegúrate de que los subdominios están configurados en DNS:${NC}"
echo -e "- grafana.vps.$PROJECT_NAME.ar"
echo -e "- prometheus.vps.$PROJECT_NAME.ar"
echo -e "- alertmanager.vps.$PROJECT_NAME.ar"
echo ""
echo -e "${YELLOW}Para controlar el monitoreo en el futuro:${NC}"
echo -e "cd $DEPLOY_PATH && ./setup-monitoring-mode.sh [off|light|full]"
