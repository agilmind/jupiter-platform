# 15. Transferir archivos al VPS

# ADVERTENCIA: Este script puede sobrescribir datos en producción
echo -e "${RED}===========================================================${NC}"
echo -e "${RED}                   ¡ADVERTENCIA!                           ${NC}"
echo -e "${RED}===========================================================${NC}"
echo -e "${YELLOW}Este script sobrescribirá configuraciones y podría afectar datos existentes.${NC}"
echo -e "${YELLOW}Si el servidor ya tiene datos en producción, considera usar update-vps.sh.${NC}"
echo -e "${RED}===========================================================${NC}"
read -p "¿Confirmas que quieres continuar? (escribe 'yes' para confirmar): " CONFIRMATION

if [[ "$CONFIRMATION" != "yes" ]]; then
    echo -e "${YELLOW}Operación cancelada.${NC}"
    exit 0
fi

echo -e "${YELLOW}Transfiriendo archivos al VPS... Esto puede tardar varios minutos...${NC}"
echo -e "${YELLOW}Tamaño del archivo de imágenes: $(du -h "$TEMP_DIR/$PROJECT_NAME-images.tar" | cut -f1)${NC}"

# Asegurarse de que el directorio existe en el VPS
ssh "$VPS_USER@$VPS_HOST" "mkdir -p $DEPLOY_PATH"

# Verificar si es una instalación existente
if ssh "$VPS_USER@$VPS_HOST" "[ -f $DEPLOY_PATH/docker-compose.yml ]"; then
    echo -e "${YELLOW}Detectada instalación existente.${NC}"
    echo -e "${YELLOW}Haciendo backup de archivos importantes...${NC}"

    # Crear respaldo de archivos cruciales
    BACKUP_DATE=$(date +"%Y%m%d_%H%M%S")
    ssh "$VPS_USER@$VPS_HOST" "cd $DEPLOY_PATH && mkdir -p backups && \
        cp docker-compose.yml backups/docker-compose.yml.$BACKUP_DATE && \
        cp .env backups/.env.$BACKUP_DATE 2>/dev/null || true && \
        cp -r nginx backups/nginx.$BACKUP_DATE 2>/dev/null || true"
fi

# Transferir todo excepto las imágenes (más rápido)
echo -e "${YELLOW}Transfiriendo archivos de configuración...${NC}"
rsync -avz --exclude="$PROJECT_NAME-images.tar" "$TEMP_DIR/deploy/" "$VPS_USER@$VPS_HOST:$DEPLOY_PATH/"
