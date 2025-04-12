#!/bin/bash
# ==============================================================================
# Deployment Script for VPS: hostinger (Phase 2: Docker Compose)
# ==============================================================================
# Ejecutado en el servidor VPS por el usuario 'deploy' via CD workflow.
# Se asume que se ejecuta desde /home/deploy/apps/hostinger/
# ==============================================================================
set -euo pipefail

readonly VPS_NAME="hostinger"
readonly COMPOSE_FILE="docker-compose.vps.yml"
readonly SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )

log_info() { echo "[INFO] [${VPS_NAME}] $1"; }
log_step() { echo "--------------------"; log_info "$1"; echo "--------------------"; }
log_error() { echo "[ERROR] [${VPS_NAME}] $1" >&2; }

# --- Asegurar que la red exista ---
ensure_network() {
    local network_name="webproxy" # Nombre de la red definida en docker-compose
    if ! docker network inspect "$network_name" > /dev/null 2>&1; then
        log_info "Network '$network_name' not found. Creating..."
        docker network create "$network_name" || { log_error "Failed to create network '$network_name'."; exit 1; }
        log_info "Network '$network_name' created successfully."
    else
        log_info "Network '$network_name' already exists."
    fi
}

# --- Ejecución Principal ---
log_info "Starting deployment for ${VPS_NAME}..."
cd "${SCRIPT_DIR}" # Asegurarse de estar en el directorio correcto
log_info "Current directory: $(pwd)"
log_info "User: $(whoami)"

log_step "Step 1: Ensuring Docker network exists..."
ensure_network

log_step "Step 2: Pulling latest Docker images..."
# Usar docker compose (v2 syntax)
docker compose -f "${COMPOSE_FILE}" pull || { log_error "Failed to pull images."; exit 1; }

log_step "Step 3: Starting/Updating services with Docker Compose..."
# -d: detached mode
# --remove-orphans: elimina contenedores de servicios que ya no existen en el compose file
# --force-recreate: opcional, fuerza la recreación incluso si la config no cambió (útil si la imagen cambió)
# --build: opcional, si necesitaras construir una imagen localmente
docker compose -f "${COMPOSE_FILE}" up -d --remove-orphans --force-recreate || { log_error "Docker compose up failed."; exit 1; }

# Opcional: Mostrar logs recientes
log_step "Step 4: Displaying recent logs (optional)..."
docker compose -f "${COMPOSE_FILE}" logs --tail=30

# Opcional: Limpiar imágenes viejas no usadas
log_step "Step 5: Pruning old Docker images (optional)..."
docker image prune -f

log_info "Deployment for ${VPS_NAME} finished successfully!"
exit 0
