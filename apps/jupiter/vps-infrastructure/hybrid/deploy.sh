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
if [ -z "$DOMAIN_NAME" ] || [[ "$DOMAIN_NAME" == "<%="* ]]; then echo "ERROR: DOMAIN_NAME no configurado."; exit 1; fi # Escapado <%=

echo "--- Iniciando Despliegue (ejecutado como usuario $(whoami)) ---"
echo " Deploy Target: $TARGET"
# ... (resto de echos informativos) ...
echo "---------------------------"

# --- Ejecución ---

# 1. Login y Pull (Solo apps, SIN sudo)
if [ "$DEPLOY_APPS" = true ]; then
  echo "[Deploy] Iniciando sesión en GHCR..."
  echo "${GHCR_TOKEN}" | docker login ghcr.io -u deploy --password-stdin
  echo "[Deploy] Descargando imágenes de apps con tag '${TAG}'..."
  docker pull "${REPO_PREFIX}/app-server:${TAG}"
  docker pull "${REPO_PREFIX}/web-app:${TAG}"
  docker pull "${REPO_PREFIX}/worker-sample:${TAG}"
else
  echo "[Deploy] Omitiendo login/pull de imágenes."
fi

# 2. Migraciones (Opcional)
# ...

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
# Mantenemos el exit estricto
if [ $EXIT_CODE -ne 0 ]; then
    echo "ERROR FATAL: Falló el comando 'docker compose up -d' con código $EXIT_CODE. Abortando."
    exit 1
fi
echo "[Deploy] Comando 'compose up' ejecutado."

# 4. CORRECCIÓN DE PERMISOS SSL (Comentado/Omitido por ahora)
# Este paso probablemente fallaría sin sudo y podría no ser estrictamente necesario
# if [ "$DEPLOY_INFRA" = true ]; then
#  echo "[Deploy] Omitiendo ajuste de permisos SSL (requeriría sudo o ajustes complejos)."
# fi

# 5. Forzar Recarga/Reinicio de Nginx (Solo infra, SIN sudo)
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
