#!/bin/bash
# Script FINAL - Lee de Env, SIN sudo interno, con obtención inicial de cert
set -e

# --- Configuración Inicial / Lógica de Flags / Variables / Validaciones ---
TARGET=${DEPLOY_TARGET:-"all"}
TAG=${IMAGE_TAG:-"latest"}
DEPLOY_INFRA=false
DEPLOY_APPS=false
DEPLOY_MONITOR=false
if [[ "$TARGET" == "infrastructure" || "$TARGET" == "all" ]]; then DEPLOY_INFRA=true; fi
if [[ "$TARGET" == "applications" || "$TARGET" == "all" ]]; then DEPLOY_APPS=true; fi
if [[ "$TARGET" == "monitoring" || "$TARGET" == "all" ]]; then DEPLOY_MONITOR=true; fi # <--- Nueva condición
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
MONITOR_COMPOSE_FILE="${CONFIG_DIR}/monitor/docker-compose.monitor.yml"
if [ "$DEPLOY_MONITOR" = true ] && [ ! -f "$MONITOR_COMPOSE_FILE" ]; then echo "ERROR: No se encontró ${MONITOR_COMPOSE_FILE}"; exit 1; fi


echo "--- Iniciando Despliegue ---"
echo " Target: $TARGET, Infra: $DEPLOY_INFRA, Apps: $DEPLOY_APPS, Mon: $DEPLOY_MONITOR, Tag: ${TAG}, Dominio: ${DOMAIN_NAME}"
echo " Target: $TARGET, Infra: $DEPLOY_INFRA, Apps: $DEPLOY_APPS, Mon: $DEPLOY_MONITOR, Tag: ${TAG}, Dominio: ${DOMAIN_NAME}"
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

# 3. Desplegar/Actualizar Stacks
echo "[Deploy] Ejecutando docker compose up..."
COMPOSE_FILES=""
if [ "$DEPLOY_INFRA" = true ]; then COMPOSE_FILES="-f ${VPS_COMPOSE_FILE}"; fi
if [ "$DEPLOY_APPS" = true ]; then COMPOSE_FILES="${COMPOSE_FILES} -f ${APP_COMPOSE_FILE}"; fi

MONITOR_COMPOSE_COMMAND=""
if [ "$DEPLOY_MONITOR" = true ]; then
  # Asegurarse que el directorio existe por si acaso
  cd "${CONFIG_DIR}/monitor" || exit 1
  MONITOR_COMPOSE_COMMAND="docker compose -f ${MONITOR_COMPOSE_FILE} up -d --remove-orphans"
  echo "[Deploy] Ejecutando: ${MONITOR_COMPOSE_COMMAND}"
  ${MONITOR_COMPOSE_COMMAND}
  MONITOR_EXIT_CODE=$?
  if [ $MONITOR_EXIT_CODE -ne 0 ]; then
      echo "ERROR FATAL: Falló 'docker compose up -d' para monitor (Código: $MONITOR_EXIT_CODE). Abortando."
      exit 1 # Hacemos que falle si monitor falla
  fi
  cd "${CONFIG_DIR}"
fi

if [ -n "$COMPOSE_FILES" ]; then
  cd "${CONFIG_DIR}" || exit 1
  echo "[Deploy] Ejecutando: docker compose ${COMPOSE_FILES} up -d --remove-orphans"
  docker compose ${COMPOSE_FILES} up -d --remove-orphans
  EXIT_CODE=$?
  if [ $EXIT_CODE -ne 0 ]; then
      echo "ERROR FATAL: Falló 'docker compose up -d' para infra/apps (Código: $EXIT_CODE). Abortando."
      exit 1
  fi
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
    echo "[Deploy] Certificado no encontrado."
    echo "[Deploy] Intentando eliminar posible lock file antiguo..."
    # Usamos 'exec' en el contenedor principal 'certbot' para borrar el lock
    # Añadimos '|| true' para que el script no falle si el archivo no existe
    docker compose -f "${VPS_COMPOSE_FILE}" exec certbot rm -f /etc/letsencrypt/.certbot.lock || true
    echo "[Deploy] Intentando obtener uno nuevo con Certbot (DNS Cloudflare)..."
    # Ahora ejecutamos 'run' para obtener el certificado
    docker compose -f "${VPS_COMPOSE_FILE}" run --rm certbot certonly \
      --non-interactive \
      --agree-tos \
      --email "${LETSENCRYPT_EMAIL}" \
      --dns-cloudflare \
      --dns-cloudflare-credentials "${CLOUDFLARE_CREDS_PATH}" \
      --dns-cloudflare-propagation-seconds 60 \
      -d "${DOMAIN_NAME}" \
      -vv # Mantenemos la verbosidad

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
  echo "[Deploy] Reiniciando Nginx (${NGINX_CONTAINER_NAME}) para cargar certificado/config..."
  if docker ps -q -f name="^/${NGINX_CONTAINER_NAME}$" > /dev/null; then
      # Contenedor existe (puede estar running o restarting), intentamos restart
      echo "Intentando restart Nginx (${NGINX_CONTAINER_NAME})..."
      docker restart ${NGINX_CONTAINER_NAME}
      RESTART_EXIT_CODE=$?
      if [ $RESTART_EXIT_CODE -ne 0 ]; then
        echo "[Error] Nginx (${NGINX_CONTAINER_NAME}) no pudo reiniciar (Código: $RESTART_EXIT_CODE)."
        # Considerar si salir con error aquí es apropiado
        # exit $RESTART_EXIT_CODE
      else
        echo "[Deploy] Nginx (${NGINX_CONTAINER_NAME}) reiniciado."
        # Esperar un poco a que arranque bien antes de que el script termine
        sleep 5
        echo "Verificando estado de Nginx post-restart:"
        docker ps -f name="^/${NGINX_CONTAINER_NAME}$"
      fi
  else
      # Esto no debería pasar si compose up funcionó, pero por si acaso
      echo "[Deploy] Contenedor Nginx (${NGINX_CONTAINER_NAME}) no encontrado. No se puede reiniciar."
  fi
else
  echo "[Deploy] Omitiendo reinicio de Nginx."
fi

# 6. Limpiar (Opcional)
# ...

echo "---------------------------"
echo "--- Despliegue Completado ---"
exit 0
