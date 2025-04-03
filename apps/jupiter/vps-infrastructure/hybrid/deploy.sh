#!/bin/bash
# Script para desplegar las aplicaciones de Jupiter Platform (Modo Copia de Archivo)
set -e

# --- Configuración ---
TAG=${1:-latest}
GHCR_TOKEN=${2}
REPO_PREFIX="ghcr.io/garciafido/jupiter-platform"
CONFIG_DIR="/home/deploy/jupiter_config"
APP_COMPOSE_FILE="${CONFIG_DIR}/docker-compose.prod.yml"
VPS_COMPOSE_FILE="${CONFIG_DIR}/docker-compose.vps.yml" # Ruta al compose de VPS

echo "--- Iniciando Despliegue Completo ---"
echo " Deployando Tag/Versión: ${TAG}"
# ... (otras validaciones si quieres) ...

# --- Ejecución ---
# 1. Login a GHCR
echo "[Deploy] Iniciando sesión en GHCR..."
echo "${GHCR_TOKEN}" | docker login ghcr.io -u deploy --password-stdin

# 2. Descargar imágenes
echo "[Deploy] Descargando imágenes con tag '${TAG}'..."
docker pull "${REPO_PREFIX}/app-server:${TAG}"
docker pull "${REPO_PREFIX}/web-app:${TAG}"
docker pull "${REPO_PREFIX}/worker-sample:${TAG}"
# (Opcional: pull de postgres, rabbitmq, etc. si no están cacheadas)

# 3. Migraciones (Opcional - Descomentar si aplica)
# echo "[Deploy] Ejecutando migraciones de base de datos..."
# cd "${CONFIG_DIR}"
# docker compose -f "${APP_COMPOSE_FILE}" run --rm app-server npx prisma migrate deploy || { echo "¡Fallo en las migraciones!"; exit 1; }

echo "[Deploy] Actualizando todos los servicios (${APP_COMPOSE_FILE} + ${VPS_COMPOSE_FILE})..."
cd "${CONFIG_DIR}"
# ¡Comando clave: usa ambos -f en una sola llamada!
docker compose -f "${APP_COMPOSE_FILE}" -f "${VPS_COMPOSE_FILE}" up -d --remove-orphans
if [ $? -ne 0 ]; then
    echo "ERROR: Falló el comando 'docker compose -f prod -f vps up -d'"
    exit 1 # Salir si el comando compose falla
fi
echo "[Deploy] Comando 'compose up' para ambos archivos ejecutado."

# 5. Limpiar (Opcional)
# echo "[Deploy] Limpiando imágenes Docker no usadas..."
# docker image prune -af

# --- Corregir permisos ---
echo "[Deploy] Asegurando permisos correctos para la clave privada SSL..."
# Usamos un contenedor temporal que monta el volumen para ejecutar chmod
# Cambiamos los permisos de cualquier archivo privkey*.pem a 644 (rw-r--r--)
docker run --rm -v certbot-etc:/etc/letsencrypt alpine:latest \
  sh -c "chmod 644 /etc/letsencrypt/archive/webapp.jupiter.ar/privkey*.pem || echo 'Advertencia: No se pudo cambiar permisos de privkey (quizás no existe aún).'"
# || echo... evita que el script falle si es la primera vez y aún no hay clave

# Opcional: Forzar recarga/reinicio de Nginx si sospechas que no lo hace solo
echo "[Deploy] Recargando Nginx para asegurar que toma los permisos/certificados..."
docker exec jupiter-nginx-proxy nginx -s reload || docker restart jupiter-nginx-proxy


echo "---------------------------"
echo "--- Despliegue Completado Exitosamente ---"
exit 0
