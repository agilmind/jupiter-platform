#!/bin/bash
# Script MÍNIMO para probar docker compose up
set -e # Mantenemos esto por seguridad

CONFIG_DIR="/home/deploy/jupiter_config"
VPS_COMPOSE_FILE="${CONFIG_DIR}/docker-compose.vps.yml"

echo "--- Iniciando Script de Prueba Mínimo ---"
echo "Cambiando a ${CONFIG_DIR}"
cd "${CONFIG_DIR}"

echo "Validando archivo compose:"
ls -l "${VPS_COMPOSE_FILE}"

# Ejecutamos compose up en primer plano, sin flags extra
echo "Ejecutando: docker compose -f ${VPS_COMPOSE_FILE} up"
docker compose -f "${VPS_COMPOSE_FILE}" up

# Si compose up termina (lo cual no debería para Nginx/Sleep), el script continuará.
EXIT_CODE=$?
echo "--- Script de Prueba Mínimo Terminado (Exit Code: ${EXIT_CODE}) ---"
exit $EXIT_CODE
