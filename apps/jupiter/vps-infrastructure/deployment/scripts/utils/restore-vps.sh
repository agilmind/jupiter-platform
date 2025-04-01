#!/bin/bash
# Script para restaurar jupiter desde un respaldo
# Versión: 2.0 - Adaptado a la nueva estructura de directorios
# Ubicación: vps-infrastructure/deployment/scripts/utils/restore-vps.sh.template

set -e  # Exit on error

# Colores para output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Verificar argumentos
if [ "$#" -ne 1 ]; then
    echo -e "${RED}Error: Debe especificar la ruta del respaldo${NC}"
    echo -e "${YELLOW}Uso: $0 ruta/al/respaldo${NC}"
    exit 1
fi

BACKUP_PATH="$1"

# Verificar que el respaldo existe
if [ ! -d "$BACKUP_PATH" ] && [ ! -f "$BACKUP_PATH" ]; then
    echo -e "${RED}Error: El respaldo especificado no existe${NC}"
    exit 1
fi

# Si es un archivo tar.gz, descomprimir
if [[ "$BACKUP_PATH" == *.tar.gz ]]; then
    echo -e "${YELLOW}Descomprimiendo respaldo...${NC}"
    TEMP_DIR=$(mktemp -d)
    tar -xzf "$BACKUP_PATH" -C "$TEMP_DIR"

    # Buscar el directorio descomprimido
    BACKUP_DIR=$(find "$TEMP_DIR" -type d -name "jupiter-backup-*" | head -n 1)

    if [ -z "$BACKUP_DIR" ]; then
        echo -e "${RED}Error: No se encontró un respaldo válido en el archivo${NC}"
        rm -rf "$TEMP_DIR"
        exit 1
    fi

    BACKUP_PATH="$BACKUP_DIR"
    echo -e "${GREEN}Respaldo descomprimido en: $BACKUP_PATH${NC}"
fi

# Configuración
PROJECT_NAME="jupiter"
VPS_USER="deploy"  # Usuario dedicado para despliegues
VPS_HOST="$PROJECT_NAME.ar"  # O la IP/dominio de tu VPS
DEPLOY_PATH="/opt/$PROJECT_NAME"  # Ruta en el VPS donde está desplegado

echo -e "${BLUE}===========================================================${NC}"
echo -e "${BLUE}Restaurando $PROJECT_NAME en $VPS_HOST${NC}"
echo -e "${BLUE}===========================================================${NC}"

# ADVERTENCIA: Este script sobrescribirá la instalación actual
echo -e "${RED}===========================================================${NC}"
echo -e "${RED}                   ¡ADVERTENCIA!                           ${NC}"
echo -e "${RED}===========================================================${NC}"
echo -e "${YELLOW}Este script sobrescribirá la instalación actual en el servidor.${NC}"
echo -e "${YELLOW}Todos los datos actuales se perderán.${NC}"
echo -e "${RED}===========================================================${NC}"
read -p "¿Estás seguro de que quieres continuar? (escribe 'yes' para confirmar): " CONFIRMATION

if [[ "$CONFIRMATION" != "yes" ]]; then
    echo -e "${YELLOW}Operación cancelada.${NC}"
    exit 0
fi

# Verificar conexión con el VPS
echo -e "${YELLOW}Verificando conexión con el VPS...${NC}"
if ! ssh -q "$VPS_USER@$VPS_HOST" exit; then
  echo -e "${RED}Error: No se puede conectar al VPS${NC}"
  exit 1
fi

# Verificar archivos necesarios en el respaldo
if [ ! -f "$BACKUP_PATH/config-backup.tar.gz" ] || [ ! -f "$BACKUP_PATH/database-backup.sql" ]; then
    echo -e "${RED}Error: El respaldo no contiene todos los archivos necesarios${NC}"
    exit 1
fi

# Determinar tipo de backup leyendo backup-info.txt si existe
BACKUP_TYPE="minimal"
if [ -f "$BACKUP_PATH/backup-info.txt" ]; then
    if grep -q "Tipo de instalación: hybrid" "$BACKUP_PATH/backup-info.txt"; then
        BACKUP_TYPE="hybrid"
    elif grep -q "Tipo de instalación: complete" "$BACKUP_PATH/backup-info.txt"; then
        BACKUP_TYPE="complete"
    fi
fi
echo -e "${YELLOW}Tipo de respaldo detectado: ${GREEN}$BACKUP_TYPE${NC}"

# 1. Transferir archivos de respaldo al VPS
echo -e "${YELLOW}Transfiriendo archivos de respaldo al VPS...${NC}"
ssh "$VPS_USER@$VPS_HOST" "mkdir -p $DEPLOY_PATH/restore"
scp "$BACKUP_PATH/config-backup.tar.gz" "$BACKUP_PATH/database-backup.sql" "$VPS_USER@$VPS_HOST:$DEPLOY_PATH/restore/"
if [ -f "$BACKUP_PATH/rabbitmq-definitions.json" ]; then
    scp "$BACKUP_PATH/rabbitmq-definitions.json" "$VPS_USER@$VPS_HOST:$DEPLOY_PATH/restore/"
fi

# 2. Crear script de restauración en el VPS
echo -e "${YELLOW}Preparando script de restauración...${NC}"
cat > /tmp/restore-script.sh << EOF
#!/bin/bash
# Script de restauración en el servidor

# Colores para consola
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

PROJECT_NAME=\$(basename \$(pwd))
RESTORE_DIR="./restore"
BACKUP_TYPE="$BACKUP_TYPE"

echo -e "\${BLUE}==========================================================\${NC}"
echo -e "\${BLUE}Restaurando \$PROJECT_NAME en el servidor\${NC}"
echo -e "\${BLUE}==========================================================\${NC}"
echo -e "\${YELLOW}Tipo de respaldo a restaurar: \${GREEN}\$BACKUP_TYPE\${NC}"

# Verificar archivos de restauración
if [ ! -f "\$RESTORE_DIR/config-backup.tar.gz" ] || [ ! -f "\$RESTORE_DIR/database-backup.sql" ]; then
    echo -e "\${RED}Error: Faltan archivos necesarios para la restauración\${NC}"
    exit 1
fi

# Detener servicios actuales
echo -e "\${YELLOW}Deteniendo servicios actuales...\${NC}"
if [ -f "docker-compose.monitoring.yml" ]; then
    docker compose -f docker-compose.monitoring.yml down || true
fi
docker compose down || true

# Crear backup del directorio actual
BACKUP_DIR="./pre-restore-backup-\$(date +%Y%m%d%H%M%S)"
echo -e "\${YELLOW}Creando backup de seguridad en \$BACKUP_DIR...\${NC}"
mkdir -p "\$BACKUP_DIR"
cp -r docker-compose.* .env nginx "\$BACKUP_DIR/" 2>/dev/null || true

# Restaurar archivos de configuración
echo -e "\${YELLOW}Restaurando archivos de configuración...\${NC}"
tar -xzf "\$RESTORE_DIR/config-backup.tar.gz" -C .

# Iniciar servicios principales
echo -e "\${YELLOW}Iniciando servicios principales...\${NC}"
docker compose up -d

# Esperar a que PostgreSQL esté listo
echo -e "\${YELLOW}Esperando a que PostgreSQL esté listo...\${NC}"
sleep 10
MAX_RETRIES=30
RETRIES=0

while ! docker compose exec postgres pg_isready -U postgres > /dev/null 2>&1; do
    RETRIES=\$((RETRIES+1))
    if [ \$RETRIES -ge \$MAX_RETRIES ]; then
        echo -e "\${RED}Error: PostgreSQL no está disponible después de \$MAX_RETRIES intentos\${NC}"
        break
    fi
    echo -e "\${YELLOW}Esperando a PostgreSQL... intento \$RETRIES/\$MAX_RETRIES\${NC}"
    sleep 5
done

# Restaurar base de datos
echo -e "\${YELLOW}Restaurando base de datos...\${NC}"
cat "\$RESTORE_DIR/database-backup.sql" | docker compose exec -T postgres psql -U postgres \$PROJECT_NAME

# Restaurar definiciones de RabbitMQ si existe
if [ -f "\$RESTORE_DIR/rabbitmq-definitions.json" ]; then
    echo -e "\${YELLOW}Restaurando definiciones de RabbitMQ...\${NC}"
    docker compose cp "\$RESTORE_DIR/rabbitmq-definitions.json" rabbitmq:/tmp/
    docker compose exec rabbitmq rabbitmqctl import_definitions /tmp/rabbitmq-definitions.json
fi

# Iniciar servicios adicionales según el tipo de respaldo
if [ "\$BACKUP_TYPE" = "hybrid" ] || [ "\$BACKUP_TYPE" = "complete" ]; then
    if [ -f "docker-compose.monitoring.yml" ]; then
        echo -e "\${YELLOW}Iniciando servicios de monitoreo...\${NC}"
        docker compose -f docker-compose.monitoring.yml up -d
    else
        echo -e "\${YELLOW}Advertencia: No se encontró docker-compose.monitoring.yml para restaurar monitoreo\${NC}"
    fi
fi

if [ "\$BACKUP_TYPE" = "complete" ]; then
    if [ -f "docker-compose.ha.yml" ]; then
        echo -e "\${YELLOW}Iniciando servicios de alta disponibilidad...\${NC}"
        docker compose -f docker-compose.ha.yml up -d
    else
        echo -e "\${YELLOW}Advertencia: No se encontró docker-compose.ha.yml para restaurar HA\${NC}"
    fi
fi

echo -e "\${GREEN}==========================================================\${NC}"
echo -e "\${GREEN}Restauración completada\${NC}"
echo -e "\${GREEN}==========================================================\${NC}"
echo -e "\${YELLOW}Se ha creado un backup de seguridad en: \$BACKUP_DIR\${NC}"
EOF

scp /tmp/restore-script.sh "$VPS_USER@$VPS_HOST:$DEPLOY_PATH/restore-script.sh"
rm /tmp/restore-script.sh

# 3. Ejecutar restauración en el VPS
echo -e "${YELLOW}Ejecutando restauración en el VPS...${NC}"
ssh "$VPS_USER@$VPS_HOST" "cd $DEPLOY_PATH && chmod +x restore-script.sh && ./restore-script.sh"

# 4. Verificar configuración de Nginx
echo -e "${YELLOW}Verificando configuración de Nginx...${NC}"
ssh "$VPS_USER@$VPS_HOST" "cd $DEPLOY_PATH && sudo cp ./nginx/conf.d/*.conf /etc/nginx/conf.d/ 2>/dev/null || true && sudo nginx -t && sudo systemctl reload nginx"

# 5. Limpiar archivos temporales
echo -e "${YELLOW}Limpiando archivos temporales...${NC}"
ssh "$VPS_USER@$VPS_HOST" "cd $DEPLOY_PATH && rm -rf restore restore-script.sh"
if [[ "$BACKUP_PATH" == "$TEMP_DIR"* ]]; then
    rm -rf "$TEMP_DIR"
fi

echo -e "${GREEN}===========================================================${NC}"
echo -e "${GREEN}Restauración completada${NC}"
echo -e "${GREEN}===========================================================${NC}"
echo ""
echo -e "${YELLOW}Servicios disponibles en:${NC}"
echo -e "- Web App: ${BLUE}https://$PROJECT_NAME.ar${NC}"
echo -e "- API: ${BLUE}https://$PROJECT_NAME.ar/api${NC}"
echo -e "- RabbitMQ Admin: ${BLUE}https://$PROJECT_NAME.ar/rabbitmq${NC}"

if [ "$BACKUP_TYPE" = "hybrid" ] || [ "$BACKUP_TYPE" = "complete" ]; then
    echo -e "- Grafana: ${BLUE}https://grafana.vps.$PROJECT_NAME.ar${NC}"
    echo -e "- Prometheus: ${BLUE}https://prometheus.vps.$PROJECT_NAME.ar${NC}"
    echo -e "- AlertManager: ${BLUE}https://alertmanager.vps.$PROJECT_NAME.ar${NC}"
fi
