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


# 4. Desplegar/Actualizar TODOS los Stacks
echo "[Deploy] Actualizando todos los servicios (${APP_COMPOSE_FILE} + ${VPS_COMPOSE_FILE})..."
cd "${CONFIG_DIR}"
docker compose -f "${APP_COMPOSE_FILE}" -f "${VPS_COMPOSE_FILE}" up -d --remove-orphans
if [ $? -ne 0 ]; then
    echo "ERROR: Falló el comando 'docker compose -f prod -f vps up -d'"
    # Podríamos no querer salir aquí si Nginx falla inicialmente por permisos
    # exit 1
    echo "ADVERTENCIA: 'compose up' devolvió error, puede ser por Nginx y permisos iniciales. Intentando corregir permisos..."
fi
echo "[Deploy] Comando 'compose up' para ambos archivos ejecutado."

# --- CORRECCIÓN DE PERMISOS SSL (DESPUÉS de compose up) ---
echo "[Deploy] Asegurando permisos correctos para Nginx en certificados SSL..."

# Permisos para la clave privada (644)
docker run --rm -v certbot-etc:/etc/letsencrypt alpine:latest \
  sh -c "chmod 644 /etc/letsencrypt/archive/${APP_DOMAIN}/privkey*.pem || echo 'Advertencia: No se pudo cambiar permisos de privkey.'"

# Permisos para directorios archive y live (755 - necesita 'x' para entrar)
docker run --rm -v certbot-etc:/etc/letsencrypt alpine:latest \
  sh -c "chmod 755 /etc/letsencrypt/archive/ /etc/letsencrypt/archive/${APP_DOMAIN}/ || echo 'Advertencia: No se pudo cambiar permisos de directorios archive.'"

# --- Forzar Recarga/Reinicio de Nginx ---
# Necesario para que Nginx tome los permisos corregidos si falló al iniciar
echo "[Deploy] Recargando/Reiniciando Nginx para aplicar permisos..."
# Intenta reload primero, si falla (ej. porque no está corriendo), intenta restart
docker exec jupiter-nginx-proxy nginx -s reload || docker restart jupiter-nginx-proxy || echo "Nginx no pudo recargar/reiniciar (puede que ya esté parado)."



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
