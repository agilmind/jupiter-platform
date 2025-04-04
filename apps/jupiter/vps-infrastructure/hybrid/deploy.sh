#!/bin/bash
# Script FINAL para desplegar las aplicaciones y/o infraestructura de Jupiter Platform
# <--- Cambio: Descripción actualizada
set -e

# --- Configuración Inicial ---
# <--- Cambio: Variables ahora se setean desde argumentos parseados
DEPLOY_INFRA=false
DEPLOY_APPS=false
TAG="latest" # Default tag
GHCR_TOKEN=""
DOMAIN_NAME="jupiter.ar" # <--- Cambio: Usar variable del generador para el dominio

# <--- Cambio: Parseo de argumentos ---
while [[ "$#" -gt 0 ]]; do
    case $1 in
        --infra) DEPLOY_INFRA=true ;;
        --apps) DEPLOY_APPS=true ;;
        --all) DEPLOY_INFRA=true; DEPLOY_APPS=true ;;
        --tag) TAG="$2"; shift ;;
        --token) GHCR_TOKEN="$2"; shift ;;
        --domain) DOMAIN_NAME="$2"; shift ;; # Opcional: permitir override del dominio
        *) echo "Parámetro desconocido: $1"; exit 1 ;;
    esac
    shift
done
# --- Fin Parseo de argumentos ---

# --- Variables Derivadas y Constantes ---
REPO_PREFIX="ghcr.io/garciafido/jupiter-platform"
CONFIG_DIR="/home/deploy/jupiter_config" # Directorio donde CD copia los archivos
APP_COMPOSE_FILE="${CONFIG_DIR}/docker-compose.prod.yml"
VPS_COMPOSE_FILE="${CONFIG_DIR}/docker-compose.vps.yml"
NGINX_CONTAINER_NAME="jupiter-nginx-proxy" # <--- Cambio: Nombre del contenedor Nginx desde vps.yml

# --- Validaciones ---
if [ "$DEPLOY_APPS" = false ] && [ "$DEPLOY_INFRA" = false ]; then
  echo "ERROR: Nada que desplegar. Especifica --infra, --apps, o --all."
  exit 1
fi
if [ "$DEPLOY_APPS" = true ] && [ -z "$GHCR_TOKEN" ]; then
  echo "ERROR: Se requiere --token cuando se despliegan aplicaciones (--apps o --all)."
  exit 1
fi
if [ ! -d "$CONFIG_DIR" ]; then
  echo "ERROR: Directorio de configuración ${CONFIG_DIR} no encontrado."
  exit 1
fi
# Validar existencia de archivos compose SOLO si se van a usar
if [ "$DEPLOY_APPS" = true ] && [ ! -f "$APP_COMPOSE_FILE" ]; then
  echo "ERROR: No se encontró ${APP_COMPOSE_FILE} (requerido para --apps/--all)."
  exit 1
fi
if [ "$DEPLOY_INFRA" = true ] && [ ! -f "$VPS_COMPOSE_FILE" ]; then
  echo "ERROR: No se encontró ${VPS_COMPOSE_FILE} (requerido para --infra/--all)."
  exit 1
fi
if [ -z "$DOMAIN_NAME" ]; then
  echo "ERROR: El nombre de dominio (domainName) no está configurado."
  exit 1
fi

echo "--- Iniciando Despliegue ---"
echo " Deploy Infra: $DEPLOY_INFRA"
echo " Deploy Apps : $DEPLOY_APPS"
echo " Tag         : ${TAG}"
echo " Dominio     : ${DOMAIN_NAME}"
echo "---------------------------"

# --- Ejecución ---

# 1. Login y Pull (Solo si se despliegan apps)
# <--- Cambio: Condicional
if [ "$DEPLOY_APPS" = true ]; then
  echo "[Deploy] Iniciando sesión en GHCR..."
  echo "${GHCR_TOKEN}" | docker login ghcr.io -u deploy --password-stdin # Ajusta '-u' si es necesario

  echo "[Deploy] Descargando imágenes de apps con tag '${TAG}'..."
  docker pull "${REPO_PREFIX}/app-server:${TAG}"
  docker pull "${REPO_PREFIX}/web-app:${TAG}"
  docker pull "${REPO_PREFIX}/worker-sample:${TAG}"
else
  echo "[Deploy] Omitiendo login/pull de imágenes (no se despliegan apps)."
fi

# 2. Migraciones (Opcional - Ejecutar solo si se despliegan apps)
# <--- Cambio: Condicional
# if [ "$DEPLOY_APPS" = true ]; then
#   echo "[Deploy] Ejecutando migraciones de base de datos..."
#   cd "${CONFIG_DIR}"
#   docker compose -f "${APP_COMPOSE_FILE}" run --rm jupiter-app-server npx prisma migrate deploy || { echo "¡Fallo en las migraciones!"; exit 1; }
# fi

# 3. Desplegar/Actualizar Stacks con Docker Compose
# <--- Cambio: Construir comando compose dinámicamente
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
docker compose ${COMPOSE_FILES} up -d --remove-orphans
if [ $? -ne 0 ]; then
    echo "ERROR: Falló el comando 'docker compose up -d'"
    # No salimos aquí si es infra, para intentar corregir permisos y recargar Nginx
    if [ "$DEPLOY_INFRA" = false ]; then
        exit 1 # Salir si falló y NO era despliegue de infra
    else
        echo "ADVERTENCIA: 'compose up' falló, se intentará corregir permisos y recargar Nginx..."
    fi
fi
echo "[Deploy] Comando 'compose up' ejecutado."

# 4. CORRECCIÓN DE PERMISOS SSL (Solo si se desplegó infra)
# <--- Cambio: Condicional y usa DOMAIN_NAME
if [ "$DEPLOY_INFRA" = true ]; then
  echo "[Deploy] Asegurando permisos correctos para Nginx en certificados SSL para ${DOMAIN_NAME}..."
  # Puede que necesites ajustar la ruta al volumen si no es exactamente 'certbot-etc' o si tiene prefijo
  CERT_VOL_PATH="certbot-etc" # Asume que el volumen se llama así globalmente

  # Permisos para la clave privada (644)
  echo "[Deploy] Aplicando chmod 644 a privkey..."
  docker run --rm -v ${CERT_VOL_PATH}:/etc/letsencrypt alpine:latest \
    sh -c "chmod 644 /etc/letsencrypt/archive/${DOMAIN_NAME}/privkey*.pem || echo 'Advertencia: No se pudo cambiar permisos de privkey (quizás no existe aún).'" || echo "Warning: Docker run for privkey chmod failed"

  # Permisos para directorios archive y live (755 - necesita 'x' para entrar)
  echo "[Deploy] Aplicando chmod 755 a directorios archive/live..."
  docker run --rm -v ${CERT_VOL_PATH}:/etc/letsencrypt alpine:latest \
    sh -c "chmod 755 /etc/letsencrypt/archive/ /etc/letsencrypt/archive/${DOMAIN_NAME}/ /etc/letsencrypt/live/ /etc/letsencrypt/live/${DOMAIN_NAME}/ || echo 'Advertencia: No se pudo cambiar permisos de directorios archive/live.'" || echo "Warning: Docker run for dir chmod failed"
else
 echo "[Deploy] Omitiendo ajuste de permisos SSL (no se desplegó infra)."
fi


# 5. Forzar Recarga/Reinicio de Nginx (Solo si se desplegó infra)
# <--- Cambio: Condicional y usa variable NGINX_CONTAINER_NAME
if [ "$DEPLOY_INFRA" = true ]; then
  echo "[Deploy] Recargando/Reiniciando Nginx (${NGINX_CONTAINER_NAME})..."
  # Verificar si el contenedor existe y está corriendo antes de ejecutar
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
      # Podría indicar un problema si esperábamos que estuviera corriendo.
  fi
else
  echo "[Deploy] Omitiendo recarga/reinicio de Nginx (no se desplegó infra)."
fi

# 6. Limpiar (Opcional - Sin cambios)
# echo "[Deploy] Limpiando imágenes Docker no usadas..."
# docker image prune -af

echo "---------------------------"
echo "--- Despliegue Completado ---"
exit 0
