#!/bin/bash
# Script para actualizar la configuración Hybrid en el VPS preservando datos
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
VPS_USER="deploy"  # Usuario dedicado para despliegues
VPS_HOST="$PROJECT_NAME.ar"  # O la IP/dominio de tu VPS
DEPLOY_PATH="/opt/$PROJECT_NAME"  # Ruta en el VPS donde se desplegará

echo -e "${BLUE}===========================================================${NC}"
echo -e "${BLUE}Iniciando actualización segura de $PROJECT_NAME (Hybrid) en $VPS_HOST${NC}"
echo -e "${BLUE}===========================================================${NC}"

# 1. Verificar que se ejecuta desde la carpeta raíz del proyecto
if [ ! -d "./apps/$PROJECT_NAME" ]; then
  echo -e "${RED}Error: Este script debe ejecutarse desde la carpeta raíz del proyecto${NC}"
  echo -e "${YELLOW}Ejemplo: bash ./apps/$PROJECT_NAME/vps-infrastructure/deployment/scripts/update-hybrid.sh${NC}"
  exit 1
fi

# 2. Verificar que el proyecto está generado correctamente
echo -e "${YELLOW}Verificando estructura del proyecto...${NC}"
if [ ! -d "./apps/$PROJECT_NAME/vps-infrastructure/hybrid" ]; then
  echo -e "${RED}Error: No se encontró la estructura de hybrid${NC}"
  echo -e "${YELLOW}Asegúrate de haber generado el proyecto con: nx g project:create $PROJECT_NAME${NC}"
  exit 1
fi

# 3. Verificar que el VPS tiene una instalación existente
echo -e "${YELLOW}Verificando instalación existente en el VPS...${NC}"
if ! ssh "$VPS_USER@$VPS_HOST" "[ -d $DEPLOY_PATH ]"; then
  echo -e "${RED}Error: No se encontró una instalación existente en $DEPLOY_PATH${NC}"
  echo -e "${YELLOW}Para una instalación inicial, usa deploy-hybrid.sh${NC}"
  exit 1
fi

# 4. Preparar respaldo en el VPS
echo -e "${YELLOW}Creando respaldo de la instalación actual...${NC}"
BACKUP_DATE=$(date +"%Y%m%d_%H%M%S")
BACKUP_FOLDER="$PROJECT_NAME-backup-$BACKUP_DATE"

# Crear respaldo de configuración y datos
ssh "$VPS_USER@$VPS_HOST" "cd $DEPLOY_PATH && \
    mkdir -p backups/$BACKUP_FOLDER && \
    cp docker-compose.yml backups/$BACKUP_FOLDER/ && \
    cp docker-compose.monitoring.yml backups/$BACKUP_FOLDER/ 2>/dev/null || true && \
    cp .env backups/$BACKUP_FOLDER/ 2>/dev/null || true && \
    cp -r nginx backups/$BACKUP_FOLDER/ 2>/dev/null || true && \
    cp -r monitoring backups/$BACKUP_FOLDER/ 2>/dev/null || true && \
    sudo docker compose exec postgres pg_dump -U postgres $PROJECT_NAME > backups/$BACKUP_FOLDER/database-backup.sql 2>/dev/null || echo 'No se pudo hacer respaldo de BD'"

echo -e "${GREEN}Respaldo creado en $DEPLOY_PATH/backups/$BACKUP_FOLDER${NC}"

# 5. Crear directorio temporal para los archivos a transferir
TEMP_DIR=$(mktemp -d)
mkdir -p "$TEMP_DIR/deploy"
echo -e "${YELLOW}Directorio temporal creado: $TEMP_DIR${NC}"

# 6. Construir imágenes base localmente (esto es necesario para los builds)
echo -e "${YELLOW}Construyendo imágenes base localmente...${NC}"
cd "./apps/$PROJECT_NAME/bin" && bash build-base-images.sh && cd ../../..

# 7. Construir las imágenes usando docker-compose.local-prod.yml
echo -e "${YELLOW}Construyendo imágenes de servicio para actualización...${NC}"
cd ./apps/$PROJECT_NAME
docker compose -f docker-compose.local-prod.yml build
cd ../..

# 8. Preparar archivos para actualización
echo -e "${YELLOW}Preparando archivos para actualización...${NC}"

# Estructura básica de directorios
mkdir -p "$TEMP_DIR/deploy/monitoring/prometheus/rules"
mkdir -p "$TEMP_DIR/deploy/monitoring/alertmanager"
mkdir -p "$TEMP_DIR/deploy/monitoring/grafana/provisioning/datasources"
mkdir -p "$TEMP_DIR/deploy/monitoring/grafana/provisioning/dashboards"
mkdir -p "$TEMP_DIR/deploy/monitoring/grafana/dashboards"
mkdir -p "$TEMP_DIR/deploy/nginx/conf.d"

# Copiar archivos de vps-infrastructure/hybrid
cp -r ./apps/$PROJECT_NAME/vps-infrastructure/hybrid/* "$TEMP_DIR/deploy/"

# Copiar archivos comunes de monitoreo
cp -r ./apps/$PROJECT_NAME/vps-infrastructure/common/monitoring/* "$TEMP_DIR/deploy/monitoring/"
cp ./apps/$PROJECT_NAME/vps-infrastructure/common/docker-compose.monitoring.yml.template "$TEMP_DIR/deploy/docker-compose.monitoring.yml"

# 9. Reemplazar variables en los archivos
echo -e "${YELLOW}Reemplazando variables en los archivos...${NC}"
find "$TEMP_DIR/deploy" -type f -exec sed -i "s/jupiter/$PROJECT_NAME/g" {} \;
find "$TEMP_DIR/deploy" -type f -exec sed -i "s/app-server/app-server/g" {} \;
find "$TEMP_DIR/deploy" -type f -exec sed -i "s/worker-sample/worker-sample/g" {} \;
find "$TEMP_DIR/deploy" -type f -exec sed -i "s/web-app/web-app/g" {} \;

# 10. Definir nombres de imágenes
APP_SERVER_IMG="$PROJECT_NAME-app-server:prod"
WEBAPP_IMG="$PROJECT_NAME-webapp:prod"
WORKER_IMG="$PROJECT_NAME-worker-sample:prod"

# 11. Obtener los nombres de las imágenes construidas y etiquetarlas
APP_SERVER_ACTUAL=$(docker compose -f ./apps/$PROJECT_NAME/docker-compose.local-prod.yml images app-server -q)
WEBAPP_ACTUAL=$(docker compose -f ./apps/$PROJECT_NAME/docker-compose.local-prod.yml images web-app -q)
WORKER_ACTUAL=$(docker compose -f ./apps/$PROJECT_NAME/docker-compose.local-prod.yml images worker-sample -q)

if [ ! -z "$APP_SERVER_ACTUAL" ]; then
  docker tag $APP_SERVER_ACTUAL $APP_SERVER_IMG
fi

if [ ! -z "$WEBAPP_ACTUAL" ]; then
  docker tag $WEBAPP_ACTUAL $WEBAPP_IMG
fi

if [ ! -z "$WORKER_ACTUAL" ]; then
  docker tag $WORKER_ACTUAL $WORKER_IMG
fi

# 12. Crear lista de imágenes para exportar
echo -e "${YELLOW}Preparando imágenes para exportar...${NC}"
IMAGE_LIST=(
  "$APP_SERVER_IMG"
  "$WEBAPP_IMG"
  "$WORKER_IMG"
)

# 13. Exportar imágenes a un archivo tar
echo -e "${YELLOW}Exportando imágenes a archivo tar...${NC}"
echo -e "${YELLOW}Esto puede tomar varios minutos dependiendo del tamaño de las imágenes...${NC}"
docker save -o "$TEMP_DIR/$PROJECT_NAME-images.tar" ${IMAGE_LIST[@]}
if [ $? -ne 0 ]; then
  echo -e "${RED}Error: Falló la exportación de imágenes${NC}"
  exit 1
fi

# 14. Transferir archivos al VPS
echo -e "${YELLOW}Transfiriendo archivos para actualización...${NC}"
echo -e "${YELLOW}Tamaño del archivo de imágenes: $(du -h "$TEMP_DIR/$PROJECT_NAME-images.tar" | cut -f1)${NC}"

# Transferir configuración de monitoreo
rsync -avz "$TEMP_DIR/deploy/monitoring/" "$VPS_USER@$VPS_HOST:$DEPLOY_PATH/monitoring/"
rsync -avz "$TEMP_DIR/deploy/docker-compose.monitoring.yml" "$VPS_USER@$VPS_HOST:$DEPLOY_PATH/"

# Transferir configuración de Nginx
rsync -avz "$TEMP_DIR/deploy/nginx/" "$VPS_USER@$VPS_HOST:$DEPLOY_PATH/nginx/"

# Verificar si el archivo de imágenes ya existe
if ssh "$VPS_USER@$VPS_HOST" "[ -f $DEPLOY_PATH/$PROJECT_NAME-images.tar ]"; then
  echo -e "${YELLOW}El archivo de imágenes ya existe en el VPS.${NC}"
  read -p "¿Deseas sobrescribirlo? (s/n): " OVERWRITE
  if [[ "$OVERWRITE" == "s" || "$OVERWRITE" == "S" ]]; then
    echo -e "${YELLOW}Transfiriendo archivo de imágenes...${NC}"
    rsync -avz "$TEMP_DIR/$PROJECT_NAME-images.tar" "$VPS_USER@$VPS_HOST:$DEPLOY_PATH/"
  else
    echo -e "${YELLOW}Se usará el archivo de imágenes existente${NC}"
  fi
else
  echo -e "${YELLOW}Transfiriendo archivo de imágenes...${NC}"
  rsync -avz "$TEMP_DIR/$PROJECT_NAME-images.tar" "$VPS_USER@$VPS_HOST:$DEPLOY_PATH/"
fi

# 15. Crear script de actualización para el VPS
cat > "$TEMP_DIR/update-server.sh" << 'EOF'
#!/bin/bash
# Script de actualización en el servidor

# Colores para consola
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

PROJECT_NAME=$(basename $(pwd))
MONITORING_STATUS="none"

echo -e "${BLUE}===========================================================${NC}"
echo -e "${BLUE}Actualizando $PROJECT_NAME en el servidor${NC}"
echo -e "${BLUE}===========================================================${NC}"

# Verificar que existen las nuevas imágenes
if [ ! -f "$PROJECT_NAME-images.tar" ]; then
  echo -e "${RED}Error: No se encontró el archivo de imágenes $PROJECT_NAME-images.tar${NC}"
  exit 1
fi

# Detectar si el monitoreo está activo
if docker ps --format "{{.Names}}" | grep -q "$PROJECT_NAME-prometheus"; then
  echo -e "${YELLOW}Detectado monitoreo activo, se restaurará después de la actualización${NC}"
  MONITORING_STATUS="active"

  # Determinar el modo actual
  if docker exec $PROJECT_NAME-prometheus cat /etc/prometheus/prometheus.yml | grep -q "storage.tsdb.retention.time=3d"; then
    MONITORING_MODE="light"
  else
    MONITORING_MODE="full"
  fi

  # Detener monitoreo
  echo -e "${YELLOW}Deteniendo servicios de monitoreo...${NC}"
  docker compose -f docker-compose.monitoring.yml down
fi

# Cargar las nuevas imágenes
echo -e "${YELLOW}Cargando nuevas imágenes...${NC}"
docker load -i $PROJECT_NAME-images.tar

# Verificar si hay contenedores en ejecución
RUNNING_CONTAINERS=$(docker compose ps -q)
if [ ! -z "$RUNNING_CONTAINERS" ]; then
  echo -e "${YELLOW}Deteniendo contenedores actuales...${NC}"
  docker compose down
fi

# Iniciar los contenedores con las nuevas imágenes
echo -e "${YELLOW}Iniciando contenedores con las nuevas imágenes...${NC}"
docker compose up -d

# Restaurar monitoreo si estaba activo
if [ "$MONITORING_STATUS" == "active" ]; then
  echo -e "${YELLOW}Restaurando servicios de monitoreo en modo $MONITORING_MODE...${NC}"
  if [ -f "./setup-monitoring-mode.sh" ]; then
    chmod +x ./setup-monitoring-mode.sh
    ./setup-monitoring-mode.sh $MONITORING_MODE
  else
    docker compose -f docker-compose.monitoring.yml up -d
  fi
fi

echo -e "${GREEN}===========================================================${NC}"
echo -e "${GREEN}Actualización completada${NC}"
echo -e "${GREEN}===========================================================${NC}"
EOF

# 16. Transferir script de actualización
rsync -avz "$TEMP_DIR/update-server.sh" "$VPS_USER@$VPS_HOST:$DEPLOY_PATH/"

# 17. Ejecutar actualización en el VPS
echo -e "${YELLOW}Ejecutando actualización en el VPS...${NC}"
ssh "$VPS_USER@$VPS_HOST" "cd $DEPLOY_PATH && chmod +x update-server.sh && ./update-server.sh"

# 18. Configurar Nginx si hay cambios
echo -e "${YELLOW}Actualizando configuración de Nginx...${NC}"
ssh "$VPS_USER@$VPS_HOST" "cd $DEPLOY_PATH && sudo cp ./nginx/conf.d/*.conf /etc/nginx/conf.d/ && sudo nginx -t && sudo systemctl reload nginx"

# 19. Limpiar archivos temporales
rm -rf "$TEMP_DIR"

echo -e "${GREEN}===========================================================${NC}"
echo -e "${GREEN}Actualización completada${NC}"
echo -e "${GREEN}===========================================================${NC}"
echo ""
echo -e "${YELLOW}Acceso a los servicios:${NC}"
echo -e "- Frontend: ${BLUE}https://$PROJECT_NAME.ar${NC}"
echo -e "- API: ${BLUE}https://$PROJECT_NAME.ar/api${NC}"
echo -e "- RabbitMQ Admin: ${BLUE}https://$PROJECT_NAME.ar/rabbitmq${NC}"
if ssh "$VPS_USER@$VPS_HOST" "docker ps --format '{{.Names}}' | grep -q '$PROJECT_NAME-prometheus'"; then
  echo -e "- Grafana: ${BLUE}https://grafana.vps.$PROJECT_NAME.ar${NC}"
  echo -e "- Prometheus: ${BLUE}https://prometheus.vps.$PROJECT_NAME.ar${NC}"
  echo -e "- AlertManager: ${BLUE}https://alertmanager.vps.$PROJECT_NAME.ar${NC}"
else
  echo -e "${YELLOW}Para iniciar el monitoreo:${NC}"
  echo -e "  ${BLUE}ssh $VPS_USER@$VPS_HOST${NC}"
  echo -e "  ${BLUE}cd $DEPLOY_PATH${NC}"
  echo -e "  ${BLUE}./setup-monitoring-mode.sh full${NC}"
fi
echo ""
echo -e "${YELLOW}Se ha creado un respaldo automático en:${NC}"
echo -e "${BLUE}$DEPLOY_PATH/backups/$BACKUP_FOLDER${NC}"
