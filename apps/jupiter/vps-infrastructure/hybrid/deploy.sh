#!/bin/bash
# Script FINAL - Lee de Env, SIN sudo interno, con obtención inicial de cert
set -e

# --- Configuración Inicial / Lógica de Flags / Variables / Validaciones ---
TARGET=${DEPLOY_TARGET:-"all"}
TAG=${IMAGE_TAG:-"latest"}
DEPLOY_INFRA=false
DEPLOY_APPS=false
if [[ "$TARGET" == "infrastructure" || "$TARGET" == "all" ]]; then DEPLOY_INFRA=true; fi
if [[ "$TARGET" == "applications" || "$TARGET" == "all" ]]; then DEPLOY_APPS=true; fi
DOMAIN_NAME=${DOMAIN_NAME:-"jupiter.ar"} # Leer de env o template
LETSENCRYPT_EMAIL=${LETSENCRYPT_EMAIL:-"garciafido@gmail.com"}

REPO_PREFIX="ghcr.io/garciafido/jupiter-platform"
CONFIG_DIR="/home/deploy/jupiter_config"
APP_COMPOSE_FILE="${CONFIG_DIR}/docker-compose.prod.yml"
VPS_COMPOSE_FILE="${CONFIG_DIR}/docker-compose.vps.yml"
NGINX_CONTAINER_NAME="jupiter-nginx-proxy"
CERT_FILE="/etc/letsencrypt/live/${DOMAIN_NAME}/fullchain.pem" # Path DENTRO del volumen/contenedor
CLOUDFLARE_CREDS_PATH="/etc/letsencrypt/cloudflare.ini" # Path DENTRO del contenedor certbot

# --- Validaciones ---
# ... (validaciones existentes) ...
if [ "$DEPLOY_INFRA" = true ] && [ -z "$LETSENCRYPT_EMAIL" ]; then echo "ERROR: LETSENCRYPT_EMAIL no configurado."; exit 1; fi
if [ "$DEPLOY_INFRA" = true ] && [ ! -f "/home/deploy/secrets/cloudflare.ini" ]; then echo "ERROR: Archivo de credenciales /home/deploy/secrets/cloudflare.ini no encontrado en el host."; exit 1; fi


echo "--- Iniciando Despliegue ---"
echo " Target: $TARGET, Infra: $DEPLOY_INFRA, Apps: $DEPLOY_APPS, Tag: ${TAG}, Dominio: ${DOMAIN_NAME}"
echo "---------------------------"

# --- Ejecución ---

# 1. Login y Pull (Solo apps)
# ... (sin cambios) ...
if [ "$DEPLOY_APPS" = true ]; then
  echo "[Deploy] Iniciando sesión en GHCR..."
  echo "${GHCR_TOKEN}" | docker login ghcr.io -u deploy --password-stdin
  echo "[Deploy] Descargando imágenes apps tag '${TAG}'..."
  docker pull "${REPO_PREFIX}/app-server:${TAG}"
  docker pull "${REPO_PREFIX}/web-app:${TAG}"
  docker pull "${REPO_PREFIX}/worker-sample:${TAG}"
else
  echo "[Deploy] Omitiendo login/pull."
fi


# 2. Migraciones (Opcional)
# ...

# 3. Desplegar/Actualizar Stacks (SIN SUDO)
echo "[Deploy] Ejecutando docker compose up..."
COMPOSE_FILES=""
if [ "$DEPLOY_INFRA" = true ]; then COMPOSE_FILES="-f ${VPS_COMPOSE_FILE}"; fi
if [ "$DEPLOY_APPS" = true ]; then COMPOSE_FILES="${COMPOSE_FILES} -f ${APP_COMPOSE_FILE}"; fi

cd "${CONFIG_DIR}"
echo "[Deploy] Ejecutando: docker compose ${COMPOSE_FILES} up -d --remove-orphans"
docker compose ${COMPOSE_FILES} up -d --remove-orphans
EXIT_CODE=$?
if [ $EXIT_CODE -ne 0 ]; then
    echo "ERROR FATAL: Falló 'docker compose up -d' código $EXIT_CODE. Abortando."
    exit 1
fi
echo "[Deploy] 'compose up' ejecutado."

# Obtener Certificado Inicial (Solo Infra)
if [ "$DEPLOY_INFRA" = true ]; then
  echo "[Deploy] Verificando/Obteniendo certificado inicial para ${DOMAIN_NAME}..."
  # Comprobamos si el archivo de certificado YA existe dentro del contenedor/volumen
  # Usamos 'docker compose exec' en el contenedor certbot (que está corriendo 'sleep infinity')
  # para verificar la existencia del archivo. Es más fiable que mirar el host path del volumen.
  if docker compose -f "${VPS_COMPOSE_FILE}" exec -T certbot test -f "${CERT_FILE}"; then
    echo "[Deploy] El certificado ya existe en ${CERT_FILE}. Omitiendo obtención inicial."
  else
    echo "[Deploy] Certificado no encontrado. Intentando obtener uno nuevo con Certbot (DNS Cloudflare)..."
    # Ejecutar Certbot usando 'docker compose run'. '--rm' elimina el contenedor después.
    docker compose -f "${VPS_COMPOSE_FILE}" run --rm certbot certonly \
      --non-interactive \
      --agree-tos \
      --email "${LETSENCRYPT_EMAIL}" \
      --dns-cloudflare \
      --dns-cloudflare-credentials "${CLOUDFLARE_CREDS_PATH}" \
      --dns-cloudflare-propagation-seconds 60 \
      -d "${DOMAIN_NAME}" # <-- Dominio principal
      # -d www.${DOMAIN_NAME} # <-- Añadir si necesitas www también

    CERTBOT_EXIT_CODE=$?
    if [ $CERTBOT_EXIT_CODE -ne 0 ]; then
      echo "ERROR FATAL: Falló la obtención del certificado con Certbot (Código: $CERTBOT_EXIT_CODE)."
      # Podrías querer ver los logs de certbot aquí si falla:
      # docker compose -f "${VPS_COMPOSE_FILE}" logs certbot
      exit $CERTBOT_EXIT_CODE
    else
      echo "[Deploy] Certificado obtenido exitosamente."
      # Es posible que necesitemos ajustar permisos aquí si Nginx no puede leerlos
      # Pero intentemos sin el chmod primero.
    fi
  fi
else
  echo "[Deploy] Omitiendo verificación/obtención de certificado (no es despliegue de infra)."
fi


# 4. CORRECCIÓN DE PERMISOS SSL (Comentado)
# ...

# 5. Forzar Recarga/Reinicio de Nginx (Solo infra, SIN sudo)
# Ahora debería funcionar porque el certificado debería existir
if [ "$DEPLOY_INFRA" = true ]; then
  echo "[Deploy] Recargando/Reiniciando Nginx (${NGINX_CONTAINER_NAME}) post-cert..."
  # Esperar un poco por si acaso certbot tarda en liberar archivos
  sleep 5
  if docker ps -q -f name="^/${NGINX_CONTAINER_NAME}$" | grep -q .; then
      echo "[Deploy] Intentando reload Nginx..."
      docker exec ${NGINX_CONTAINER_NAME} nginx -s reload
      RELOAD_EXIT_CODE=$?
      if [ $RELOAD_EXIT_CODE -ne 0 ]; then
        echo "[Deploy] Reload falló (Código: $RELOAD_EXIT_CODE), intentando restart Nginx..."
        docker restart ${NGINX_CONTAINER_NAME} || echo "[Error] Nginx no pudo reiniciar."
      else
        echo "[Deploy] Nginx recargado exitosamente."
      fi
  else
      echo "[Deploy] Contenedor Nginx no encontrado o no corriendo."
  fi
else
  echo "[Deploy] Omitiendo recarga/reinicio de Nginx."
fi

# 6. Limpiar (Opcional)
# ...

echo "---------------------------"
echo "--- Despliegue Completado ---"
exit 0
