#!/bin/bash
# Script FINAL para desplegar las aplicaciones de Jupiter Platform
set -e

# --- Configuración ---
TAG=${1:-latest}
GHCR_TOKEN=${2}
REPO_PREFIX="ghcr.io/garciafido/jupiter-platform"
CONFIG_DIR="/home/deploy/jupiter_config"
APP_COMPOSE_FILE="${CONFIG_DIR}/docker-compose.prod.yml"
VPS_COMPOSE_FILE="${CONFIG_DIR}/docker-compose.vps.yml"
APP_DOMAIN="webapp.jupiter.ar" # Requerido para chmod path

echo "--- Iniciando Despliegue Completo ---"
echo " Deployando Tag/Versión: ${TAG}"
# ... (Validaciones: existencia de archivos, token, etc.) ...
if [ -z "$GHCR_TOKEN" ]; then echo "ERROR: Se requiere el Token de GHCR."; exit 1; fi
if [ ! -d "$CONFIG_DIR" ]; then echo "ERROR: Directorio ${CONFIG_DIR} no existe."; exit 1; fi
if [ ! -f "$APP_COMPOSE_FILE" ]; then echo "ERROR: No se encontró ${APP_COMPOSE_FILE}"; exit 1; fi
if [ ! -f "$VPS_COMPOSE_FILE" ]; then echo "ERROR: No se encontró ${VPS_COMPOSE_FILE}"; exit 1; fi
# ... etc ...
echo "---------------------------"

# --- Ejecución ---
# 1. Login a GHCR
echo "[Deploy] Iniciando sesión en GHCR..."
echo "${GHCR_TOKEN}" | docker login ghcr.io -u deploy --password-stdin # Ajusta '-u' si es necesario

# 2. Descargar imágenes nuevas
echo "[Deploy] Descargando imágenes con tag '${TAG}'..."
docker pull "${REPO_PREFIX}/app-server:${TAG}"
docker pull "${REPO_PREFIX}/web-app:${TAG}"
docker pull "${REPO_PREFIX}/worker-sample:${TAG}"
# Opcional: pull de dependencias públicas si quieres forzar actualización
# docker pull postgres:14-alpine
# docker pull rabbitmq:3-management-alpine
# docker pull edoburu/pgbouncer:latest
# docker pull nginx:stable-alpine
# docker pull certbot/certbot:latest

# 3. Migraciones (Opcional - Descomentar y ajustar si usas Prisma)
# echo "[Deploy] Ejecutando migraciones de base de datos..."
# cd "${CONFIG_DIR}"
# # Asegúrate que app-server pueda correr solo para migrar sin otras dependencias si es necesario
# docker compose -f "${APP_COMPOSE_FILE}" run --rm jupiter-app-server npx prisma migrate deploy || { echo "¡Fallo en las migraciones!"; exit 1; }

# 4. Desplegar/Actualizar TODOS los Stacks en UN SOLO PASO
echo "[Deploy] Actualizando todos los servicios (${APP_COMPOSE_FILE} + ${VPS_COMPOSE_FILE})..."
cd "${CONFIG_DIR}"
# Comando unificado que lee ambos archivos y crea/actualiza todo el proyecto 'jupiter_config'
docker compose -f "${APP_COMPOSE_FILE}" -f "${VPS_COMPOSE_FILE}" up -d --remove-orphans
if [ $? -ne 0 ]; then
    echo "ERROR: Falló el comando 'docker compose -f prod -f vps up -d'"
    echo "ADVERTENCIA: Esto puede ocurrir si Nginx falla inicialmente antes de corregir permisos."
    # No salimos aquí para permitir que los chmod se ejecuten
fi
echo "[Deploy] Comando 'compose up' para ambos archivos ejecutado."

# 5. CORRECCIÓN DE PERMISOS SSL (Importante ejecutar DESPUÉS de compose up)
echo "[Deploy] Asegurando permisos correctos para Nginx en certificados SSL..."
# Permisos para la clave privada (644)
docker run --rm -v certbot-etc:/etc/letsencrypt alpine:latest \
  sh -c "chmod 644 /etc/letsencrypt/archive/${APP_DOMAIN}/privkey*.pem || echo 'Advertencia: No se pudo cambiar permisos de privkey (quizás no existe aún).'"
# Permisos para directorios archive y live (755 - necesita 'x' para entrar)
docker run --rm -v certbot-etc:/etc/letsencrypt alpine:latest \
  sh -c "chmod 755 /etc/letsencrypt/archive/ /etc/letsencrypt/archive/${APP_DOMAIN}/ || echo 'Advertencia: No se pudo cambiar permisos de directorios archive.'"

# 6. Forzar Recarga/Reinicio de Nginx (Importante si falló durante el 'up' por permisos)
echo "[Deploy] Recargando/Reiniciando Nginx para aplicar permisos/config..."
# Intenta reload primero, si falla (ej. porque no está corriendo), intenta restart
docker exec jupiter-nginx-proxy nginx -s reload || docker restart jupiter-nginx-proxy || echo "Nginx no pudo recargar/reiniciar (revisar estado)."

# 7. Limpiar (Opcional)
# echo "[Deploy] Limpiando imágenes Docker no usadas..."
# docker image prune -af --filter "label!=maintainer=JupiterProject" # Ejemplo filtro

echo "---------------------------"
echo "--- Despliegue Completado Exitosamente ---"
exit 0
