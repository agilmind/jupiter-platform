#!/bin/bash
# ==============================================================================
# Script para GitHub Actions: Simula Pasos de Despliegue (Fase 1)
# ==============================================================================
set -euo pipefail

# Acceder a las variables de la matriz definidas en el job 'strategy'
# GitHub Actions las expone como variables de entorno
VPS_NAME="${{ matrix.vps_name }}"
VPS_NAME_UPPER="${{ matrix.vps_name_upper }}"

# Acceder a secrets (estos solo tendrán valor dentro de GitHub Actions)
# Usamos format() para construir el nombre del secret dinámicamente
TARGET_HOST="\${{ secrets[format('VPS_{0}_HOST', matrix.vps_name_upper)] }}"
TARGET_USER="\${{ secrets[format('VPS_{0}_USER', matrix.vps_name_upper)] }}" # Asumimos 'deploy' pero podría ser un secret

echo "[simulate-deploy.sh] Phase 1: Simulation Only for ${VPS_NAME}"
echo "--------------------------------------------------"
echo "[simulate-deploy.sh] Target Host (from secrets): ${TARGET_HOST:-<secret VPS_${VPS_NAME_UPPER}_HOST not available>}"
echo "[simulate-deploy.sh] Target User (from secrets): ${TARGET_USER:-<secret VPS_${VPS_NAME_UPPER}_USER not available, using default 'deploy'>}"
USER_TO_CONNECT=${TARGET_USER:-deploy} # Usar default si el secret no está

echo ""
echo "[simulate-deploy.sh] Would normally perform these steps:"
echo "1. Setup SSH using secret VPS_${VPS_NAME_UPPER}_KEY"
echo "2. Add remote host ${TARGET_HOST} to known_hosts"
echo "3. Sync files from ./apps/${VPS_NAME}/ to ${USER_TO_CONNECT}@${TARGET_HOST}:/home/deploy/apps/${VPS_NAME}/ via rsync"
echo "4. Execute remote 'bash deploy.sh' in /home/deploy/apps/${VPS_NAME} via ssh ${USER_TO_CONNECT}@${TARGET_HOST}"
echo "--------------------------------------------------"

echo "[simulate-deploy.sh] Simulating work..."
sleep 2

echo "[simulate-deploy.sh] Simulation finished successfully."
