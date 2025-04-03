#!/bin/bash
# Script para desplegar las aplicaciones de Jupiter Platform (Modo Copia de Archivo)
set -e

# --- Configuración ---
TAG=${1:-latest}
GHCR_TOKEN=${2}
REPO_PREFIX="ghcr.io/garciafido/jupiter-platform"
CONFIG_DIR="/home/deploy/jupiter_config" # Directorio donde Actions copia los archivos
APP_COMPOSE_FILE="${CONFIG_DIR}/docker-compose.prod.yml"
VPS_COMPOSE_FILE="${CONFIG_DIR}/docker-compose.vps.yml" # Ruta al nuevo compose de VPS

echo "--- Iniciando Despliegue (Modo Copia de Archivo) ---"
echo " Deployando Tag/Versión: ${TAG}"
echo " Usando Compose de Apps: ${APP_COMPOSE_FILE}"
echo " Usando Compose de VPS : ${VPS_COMPOSE_FILE}"
echo " Directorio de Config: ${CONFIG_DIR}"
echo "---------------------------"

# --- Validaciones ---
if [ -z "$GHCR_TOKEN" ]; then echo "ERROR: Se requiere el Token de GHCR."; exit 1; fi
if [ ! -d "$CONFIG_DIR" ]; then echo "ERROR: Directorio de configuración ${CONFIG_DIR} no existe."; exit 1; fi
if [ ! -f "$APP_COMPOSE_FILE" ]; then echo "ERROR: No se encontró ${APP_COMPOSE_FILE}"; exit 1; fi
# No fallar si VPS_COMPOSE_FILE no existe aún, solo advertir después
if ! command -v docker &> /dev/null; then echo "ERROR: Comando 'docker' no encontrado."; exit 1; fi
if ! docker compose version &> /dev/null; then echo "ERROR: Comando 'docker compose' no encontrado."; exit 1; fi

# --- Ejecución ---
# 1. Login a GHCR
echo "[Deploy] Iniciando sesión en GHCR..."
echo "${GHCR_TOKEN}" | docker login ghcr.io -u deploy --password-stdin # Ajusta '-u' si es necesario

# 2. Descargar imágenes
echo "[Deploy] Descargando imágenes con tag '${TAG}'..."
docker pull "${REPO_PREFIX}/app-server:${TAG}"
docker pull "${REPO_PREFIX}/web-app:${TAG}"
docker pull "${REPO_PREFIX}/worker-sample:${TAG}"

# 3. Migraciones (Opcional - Descomentar si aplica)
# echo "[Deploy] Ejecutando migraciones de base de datos..."
# cd "${CONFIG_DIR}"
# docker compose -f "${APP_COMPOSE_FILE}" run --rm app-server npx prisma migrate deploy || { echo "¡Fallo en las migraciones!"; exit 1; }

# 4. Levantar/Actualizar Stack de Aplicaciones
echo "[Deploy] Actualizando servicios de Aplicación (${APP_COMPOSE_FILE})..."
cd "${CONFIG_DIR}"
docker compose -f "${APP_COMPOSE_FILE}" up -d --remove-orphans

# 5. Levantar/Actualizar Stack de Infraestructura VPS (Nginx)
echo "[Deploy] Actualizando servicios de Infraestructura VPS (${VPS_COMPOSE_FILE})..."
cd "${CONFIG_DIR}"
if [ -f "$VPS_COMPOSE_FILE" ]; then
    docker compose -f "${VPS_COMPOSE_FILE}" up -d --remove-orphans
else
    echo "ADVERTENCIA: No se encontró ${VPS_COMPOSE_FILE}. Omitiendo despliegue de Nginx."
fi

# 6. Limpiar (Opcional)
# echo "[Deploy] Limpiando imágenes Docker no usadas..."
# docker image prune -af

echo "---------------------------"
echo "--- Despliegue Completado Exitosamente ---"
exit 0
