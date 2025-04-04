#!/bin/bash
# Script FINAL para desplegar las aplicaciones y/o infraestructura de Jupiter Platform
# <--- Cambio: Lee parámetros de variables de entorno
set -e

# --- Configuración Inicial - Leída desde el Entorno ---
# Variables esperadas: DEPLOY_TARGET, IMAGE_TAG, GHCR_TOKEN
# Valores por defecto por si acaso (aunque el workflow debería pasarlas)
TARGET=${DEPLOY_TARGET:-"all"} # Default a 'all' si no se pasa
TAG=${IMAGE_TAG:-"latest"} # Default a 'latest'
# GHCR_TOKEN ya viene del entorno o es vacío

# <--- Cambio: Lógica de flags basada en TARGET ---
DEPLOY_INFRA=false
DEPLOY_APPS=false
if [[ "$TARGET" == "infrastructure" || "$TARGET" == "all" ]]; then
  DEPLOY_INFRA=true
fi
if [[ "$TARGET" == "applications" || "$TARGET" == "all" ]]; then
  DEPLOY_APPS=true
fi

# <--- Cambio: Obtener domainName (si es necesario) - ¿De dónde viene ahora?
# Si domainName también venía como argumento, necesitará pasarse por env
# Si está hardcodeado en el template o se obtiene de otra forma, mantener eso.
# Asumiendo que se necesita (para chmod), lo ponemos como variable, pero necesita valor.
# Podrías pasarlo como env: DOMAIN_NAME: "tu.dominio.com" en el workflow
DOMAIN_NAME=${DOMAIN_NAME:-"jupiter.ar"} # Usa env var o template fallback

# --- Variables Derivadas y Constantes ---
REPO_PREFIX="ghcr.io/garciafido/jupiter-platform"
CONFIG_DIR="/home/deploy/jupiter_config" # Directorio donde CD copia los archivos
APP_COMPOSE_FILE="${CONFIG_DIR}/docker-compose.prod.yml"
VPS_COMPOSE_FILE="${CONFIG_DIR}/docker-compose.vps.yml"
NGINX_CONTAINER_NAME="jupiter-nginx-proxy"

# --- Validaciones ---
if [ "$DEPLOY_APPS" = false ] && [ "$DEPLOY_INFRA" = false ]; then
  echo "ERROR: Target de despliegue inválido: $TARGET. Usar 'infrastructure', 'applications', o 'all'."
  exit 1
fi
if [ "$DEPLOY_APPS" = true ] && [ -z "$GHCR_TOKEN" ]; then
  echo "ERROR: Se requiere la variable de entorno GHCR_TOKEN cuando se despliegan aplicaciones."
  exit 1
fi
# ... (Otras validaciones como antes) ...
if [ ! -d "$CONFIG_DIR" ]; then echo "ERROR: Directorio ${CONFIG_DIR} no existe."; exit 1; fi
if [ "$DEPLOY_APPS" = true ] && [ ! -f "$APP_COMPOSE_FILE" ]; then echo "ERROR: No se encontró ${APP_COMPOSE_FILE}"; exit 1; fi
if [ "$DEPLOY_INFRA" = true ] && [ ! -f "$VPS_COMPOSE_FILE" ]; then echo "ERROR: No se encontró ${VPS_COMPOSE_FILE}"; exit 1; fi
if [ -z "$DOMAIN_NAME" ] || [[ "$DOMAIN_NAME" == "<%="* ]]; then echo "ERROR: DOMAIN_NAME no configurado."; exit 1; fi


echo "--- Iniciando Despliegue ---"
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
  # GHCR_TOKEN viene del entorno
  echo "${GHCR_TOKEN}" | docker login ghcr.io -u deploy --password-stdin
  echo "[Deploy] Descargando imágenes de apps con tag '${TAG}'..."
  docker pull "${REPO_PREFIX}/app-server:${TAG}"
  docker pull "${REPO_PREFIX}/web-app:${TAG}"
  docker pull "${REPO_PREFIX}/worker-sample:${TAG}"
else
  echo "[Deploy] Omitiendo login/pull de imágenes (no se despliegan apps)."
fi

# 2. Migraciones (Opcional - Ejecutar solo si se despliegan apps)
# ... (Sin cambios, usa la variable DEPLOY_APPS) ...

# 3. Desplegar/Actualizar Stacks con Docker Compose
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
# <--- CAMBIO: Ejecutar docker compose SIN sudo si el usuario deploy está en el grupo docker
# docker compose ${COMPOSE_FILES} up -d --remove-orphans
# Si necesita sudo, mantenerlo:
sudo docker compose ${COMPOSE_FILES} up -d --remove-orphans
EXIT_CODE=$?
if [ $EXIT_CODE -ne 0 ]; then
    echo "ERROR: Falló el comando 'docker compose up -d' con código $EXIT_CODE"
    if [ "$DEPLOY_INFRA" = false ]; then
        exit 1 # Salir si falló y NO era despliegue de infra
    else
        echo "ADVERTENCIA: 'compose up' falló, se intentará corregir permisos y recargar Nginx..."
    fi
fi
echo "[Deploy] Comando 'compose up' ejecutado."

# 4. CORRECCIÓN DE PERMISOS SSL (Solo si se desplegó infra)
if [ "$DEPLOY_INFRA" = true ]; then
  echo "[Deploy] Asegurando permisos correctos para Nginx en certificados SSL para ${DOMAIN_NAME}..."
  CERT_VOL_PATH="certbot-etc"
  echo "[Deploy] Aplicando chmod 644 a privkey..."
  # <--- CAMBIO: Usar docker SIN sudo si deploy está en grupo docker
  docker run --rm -v ${CERT_VOL_PATH}:/etc/letsencrypt alpine:latest \
    sh -c "chmod 644 /etc/letsencrypt/archive/${DOMAIN_NAME}/privkey*.pem || echo 'Advertencia: No se pudo cambiar permisos de privkey.'" || echo "Warning: Docker run for privkey chmod failed"
  echo "[Deploy] Aplicando chmod 755 a directorios archive/live..."
  docker run --rm -v ${CERT_VOL_PATH}:/etc/letsencrypt alpine:latest \
    sh -c "chmod 755 /etc/letsencrypt/archive/ /etc/letsencrypt/archive/${DOMAIN_NAME}/ /etc/letsencrypt/live/ /etc/letsencrypt/live/${DOMAIN_NAME}/ || echo 'Advertencia: No se pudo cambiar permisos de directorios archive/live.'" || echo "Warning: Docker run for dir chmod failed"
else
 echo "[Deploy] Omitiendo ajuste de permisos SSL (no se desplegó infra)."
fi

# 5. Forzar Recarga/Reinicio de Nginx (Solo si se desplegó infra)
if [ "$DEPLOY_INFRA" = true ]; then
  echo "[Deploy] Recargando/Reiniciando Nginx (${NGINX_CONTAINER_NAME})..."
  # <--- CAMBIO: Usar docker SIN sudo si deploy está en grupo docker
  if docker ps -q -f name="^/${NGINX_CONTAINER_NAME}$" | grep -q .; then
      echo "[Deploy] Intentando reload Nginx (${NGINX_CONTAINER_NAME})..."
      docker exec ${NGINX_CONTAINER_NAME} nginx -s reload
      if [ $? -ne 0 ]; then
        echo "[Deploy] Reload falló, intentando restart Nginx (${NGINX_CONTAINER_NAME})..."
        docker restart ${NGINX_CONTAINER_NAME} || echo "[Error] Nginx (${NGINX_CONTAINER_NAME}) no pudo reiniciar."
      else
        echo "[Deploy] Nginx (${NGINX_CONTAINER_NAME}) recargado exitosamente."
      fi
  else
      echo "[Deploy] Contenedor Nginx (${NGINX_CONTAINER_NAME}) no encontrado o no corriendo, omitiendo reload/restart."
  fi
else
  echo "[Deploy] Omitiendo recarga/reinicio de Nginx (no se desplegó infra)."
fi

# 6. Limpiar (Opcional)
# ... (Sin cambios) ...

echo "---------------------------"
echo "--- Despliegue Completado ---"
exit 0
