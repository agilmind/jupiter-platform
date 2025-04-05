#!/bin/bash
# Script FINAL para desplegar las aplicaciones y/o infraestructura de Jupiter Platform
# Versión que lee de entorno y ejecuta comandos Docker SIN sudo
set -e

# --- Configuración Inicial - Leída desde el Entorno ---
TARGET=${DEPLOY_TARGET:-"all"}
TAG=${IMAGE_TAG:-"latest"}
# GHCR_TOKEN viene del entorno

# --- Lógica de Flags ---
DEPLOY_INFRA=false
DEPLOY_APPS=false
if [[ "$TARGET" == "infrastructure" || "$TARGET" == "all" ]]; then
  DEPLOY_INFRA=true
fi
if [[ "$TARGET" == "applications" || "$TARGET" == "all" ]]; then
  DEPLOY_APPS=true
fi

# --- Dominio ---
DOMAIN_NAME=${DOMAIN_NAME:-"jupiter.ar"}

# --- Variables Derivadas y Constantes ---
REPO_PREFIX="ghcr.io/garciafido/jupiter-platform"
CONFIG_DIR="/home/deploy/jupiter_config"
APP_COMPOSE_FILE="${CONFIG_DIR}/docker-compose.prod.yml"
VPS_COMPOSE_FILE="${CONFIG_DIR}/docker-compose.vps.yml"
NGINX_CONTAINER_NAME="jupiter-nginx-proxy"

# --- Validaciones ---
if [ "$DEPLOY_APPS" = false ] && [ "$DEPLOY_INFRA" = false ]; then echo "ERROR: Target inválido: $TARGET."; exit 1; fi
if [ "$DEPLOY_APPS" = true ] && [ -z "$GHCR_TOKEN" ]; then echo "ERROR: GHCR_TOKEN es requerido para desplegar apps."; exit 1; fi
if [ ! -d "$CONFIG_DIR" ]; then echo "ERROR: Directorio ${CONFIG_DIR} no existe."; exit 1; fi
if [ "$DEPLOY_APPS" = true ] && [ ! -f "$APP_COMPOSE_FILE" ]; then echo "ERROR: No se encontró ${APP_COMPOSE_FILE}"; exit 1; fi
if [ "$DEPLOY_INFRA" = true ] && [ ! -f "$VPS_COMPOSE_FILE" ]; then echo "ERROR: No se encontró ${VPS_COMPOSE_FILE}"; exit 1; fi
if [ -z "$DOMAIN_NAME" ] || [[ "$DOMAIN_NAME" == "<%="* ]]; then echo "ERROR: DOMAIN_NAME no configurado."; exit 1; fi

echo "--- Iniciando Despliegue (ejecutado como usuario $(whoami)) ---"
echo " Deploy Target: $TARGET"
echo " Deploy Infra : $DEPLOY_INFRA"
echo " Deploy Apps  : $DEPLOY_APPS"
echo " Tag          : ${TAG}"
echo " Dominio      : ${DOMAIN_NAME}"
echo "---------------------------"

# --- Ejecución ---

# 1. Login y Pull (Solo si se despliegan apps)
if [ "$DEPLOY_APPS" = true ]; then
  echo "[Deploy] Iniciando sesión en GHCR..."
  echo "${GHCR_TOKEN}" | docker login ghcr.io -u deploy --password-stdin # Asume que '-u deploy' es correcto o usa tu usuario GHCR
  echo "[Deploy] Descargando imágenes de apps con tag '${TAG}'..."
  docker pull "${REPO_PREFIX}/app-server:${TAG}"
  docker pull "${REPO_PREFIX}/web-app:${TAG}"
  docker pull "${REPO_PREFIX}/worker-sample:${TAG}"
else
  echo "[Deploy] Omitiendo login/pull de imágenes."
fi

# 2. Migraciones (Opcional)
# if [ "$DEPLOY_APPS" = true ]; then ... fi

# 3. Desplegar/Actualizar Stacks con Docker Compose (SIN SUDO)
echo "[Deploy] Construyendo y ejecutando comando docker compose..."
COMPOSE_FILES=""
if [ "$DEPLOY_INFRA" = true ]; then
  COMPOSE_FILES="-f ${VPS_COMPOSE_FILE}"
fi
if [ "$DEPLOY_APPS" = true ]; then
  COMPOSE_FILES="${COMPOSE_FILES} -f ${APP_COMPOSE_FILE}"
fi

cd "${CONFIG_DIR}"
echo "[Deploy] Ejecutando: docker compose ${COMPOSE_FILES} up -d --remove-orphans"
docker compose ${COMPOSE_FILES} up -d --remove-orphans # <-- SIN sudo
EXIT_CODE=$?
if [ $EXIT_CODE -ne 0 ]; then
    # Mantenemos el exit estricto que pusimos antes
    echo "ERROR FATAL: Falló el comando 'docker compose up -d' con código $EXIT_CODE. Abortando."
    exit 1
fi
echo "[Deploy] Comando 'compose up' ejecutado."

# 4. CORRECCIÓN DE PERMISOS SSL (Solo si se desplegó infra - SIN SUDO)
if [ "$DEPLOY_INFRA" = true ]; then
  # Este paso podría fallar si el usuario deploy no tiene permisos sobre el volumen certbot-etc
  echo "[Deploy] Asegurando permisos correctos en certificados SSL para ${DOMAIN_NAME} (como usuario $(whoami))..."
  CERT_VOL_PATH="certbot-etc" # El nombre del volumen
  echo "[Deploy] Aplicando chmod 644 a privkey (¡puede fallar!)..."
  # Usar docker run para acceder al volumen montado por el contenedor certbot (si está corriendo) o directamente si se conoce el path del host
  # Intentar con docker run puede requerir que certbot esté corriendo o montar el volumen aquí.
  # Es MÁS PROBABLE que este paso falle sin sudo si los archivos dentro del volumen no pertenecen a 'deploy'.
  # Considera quitar este paso si certbot manejará permisos o si Nginx puede leerlos de todas formas.
  docker run --rm -v ${CERT_VOL_PATH}:/etc/letsencrypt alpine:latest \
    sh -c "chmod 644 /etc/letsencrypt/archive/${DOMAIN_NAME}/privkey*.pem || echo 'Advertencia: No se pudo cambiar permisos de privkey (quizás requiere sudo o el path es incorrecto).'" || echo "Warning: Docker run for privkey chmod failed"
  echo "[Deploy] Aplicando chmod 755 a directorios archive/live (¡puede fallar!)..."
  docker run --rm -v ${CERT_VOL_PATH}:/etc/letsencrypt alpine:latest \
    sh -c "chmod 755 /etc/letsencrypt/archive/ /etc/letsencrypt/archive/${DOMAIN_NAME}/ /etc/letsencrypt/live/ /etc/letsencrypt/live/${DOMAIN_NAME}/ || echo 'Advertencia: No se pudo cambiar permisos de directorios (quizás requiere sudo o el path es incorrecto).'" || echo "Warning: Docker run for dir chmod failed"
else
 echo "[Deploy] Omitiendo ajuste de permisos SSL."
fi

# 5. Forzar Recarga/Reinicio de Nginx (Solo si se desplegó infra - SIN SUDO)
if [ "$DEPLOY_INFRA" = true ]; then
  echo "[Deploy] Recargando/Reiniciando Nginx (${NGINX_CONTAINER_NAME})..."
  if docker ps -q -f name="^/${NGINX_CONTAINER_NAME}$" | grep -q .; then
      echo "[Deploy] Intentando reload Nginx (${NGINX_CONTAINER_NAME})..."
      docker exec ${NGINX_CONTAINER_NAME} nginx -s reload # <-- SIN sudo
      if [ $? -ne 0 ]; then
        echo "[Deploy] Reload falló, intentando restart Nginx (${NGINX_CONTAINER_NAME})..."
        docker restart ${NGINX_CONTAINER_NAME} || echo "[Error] Nginx (${NGINX_CONTAINER_NAME}) no pudo reiniciar." # <-- SIN sudo
      else
        echo "[Deploy] Nginx (${NGINX_CONTAINER_NAME}) recargado exitosamente."
      fi
  else
      echo "[Deploy] Contenedor Nginx (${NGINX_CONTAINER_NAME}) no encontrado o no corriendo."
  fi
else
  echo "[Deploy] Omitiendo recarga/reinicio de Nginx."
fi

# 6. Limpiar (Opcional)
# ...

echo "---------------------------"
echo "--- Despliegue Completado ---"
exit 0
