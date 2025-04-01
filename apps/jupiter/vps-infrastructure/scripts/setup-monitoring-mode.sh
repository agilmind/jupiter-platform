#!/bin/bash
# Script para configurar el modo de monitoreo (apagado/ligero/completo)
# Versión: 1.0

set -e  # Exit on error

# Colores para output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Carpeta actual donde se ejecuta el script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_NAME="jupiter"
DOCKER_COMPOSE_FILE="$SCRIPT_DIR/docker-compose.monitoring.yml"
PROMETHEUS_CONFIG="$SCRIPT_DIR/monitoring/prometheus/prometheus.yml"
ALERTMANAGER_CONFIG="$SCRIPT_DIR/monitoring/alertmanager/alertmanager.yml"

# Verificar requisitos
if [ ! -f "$DOCKER_COMPOSE_FILE" ]; then
    echo -e "${RED}Error: No se encontró el archivo docker-compose.monitoring.yml${NC}"
    exit 1
fi

print_usage() {
    echo -e "${BLUE}Uso: $0 [off|light|full]${NC}"
    echo -e "${YELLOW}Modos disponibles:${NC}"
    echo -e "  ${GREEN}off${NC}     - Detiene todos los servicios de monitoreo"
    echo -e "  ${GREEN}light${NC}   - Inicia monitoreo en modo ligero (menos recursos, retención corta)"
    echo -e "  ${GREEN}full${NC}    - Inicia monitoreo completo (todas las métricas, alertas, retención larga)"
    echo
    echo -e "${YELLOW}Si no se especifica modo, se muestra el estado actual${NC}"
}

get_current_status() {
    local running_containers=$(docker ps --format '{{.Names}}' | grep -E '(prometheus|grafana|alertmanager|exporter)' | wc -l)

    if [ "$running_containers" -eq 0 ]; then
        echo "off"
    else
        # Verificar si es modo ligero o completo
        local retention=$(docker exec $PROJECT_NAME-prometheus cat /etc/prometheus/prometheus.yml | grep "storage.tsdb.retention.time" | grep -oE "[0-9]+d" | grep -oE "[0-9]+" || echo "0")

        if [ "$retention" -le 7 ]; then
            echo "light"
        else
            echo "full"
        fi
    fi
}

configure_light_mode() {
    echo -e "${YELLOW}Configurando modo de monitoreo ligero...${NC}"

    # Actualizar configuración de Prometheus para modo ligero
    docker exec $PROJECT_NAME-prometheus sed -i 's/--storage.tsdb.retention.time=15d/--storage.tsdb.retention.time=3d/g' /etc/prometheus/prometheus.yml

    # Actualizar intervalo de scraping a 30s
    docker exec $PROJECT_NAME-prometheus sed -i 's/scrape_interval: 15s/scrape_interval: 30s/g' /etc/prometheus/prometheus.yml

    # Recargar configuración de Prometheus
    docker exec $PROJECT_NAME-prometheus kill -HUP 1

    # Ajustar límites de recursos en el compose file
    cp "$DOCKER_COMPOSE_FILE" "$DOCKER_COMPOSE_FILE.bak"

    # Ajustar recursos para servicios
    sed -i 's/memory: 1G/memory: 512M/g' "$DOCKER_COMPOSE_FILE"
    sed -i 's/memory: 512M/memory: 256M/g' "$DOCKER_COMPOSE_FILE"
    sed -i 's/cpus: .1./cpus: 0.5/g' "$DOCKER_COMPOSE_FILE"

    # Aplicar cambios
    docker compose -f "$DOCKER_COMPOSE_FILE" up -d

    echo -e "${GREEN}Modo ligero configurado correctamente${NC}"
}

configure_full_mode() {
    echo -e "${YELLOW}Configurando modo de monitoreo completo...${NC}"

    # Actualizar configuración de Prometheus para modo completo
    docker exec $PROJECT_NAME-prometheus sed -i 's/--storage.tsdb.retention.time=3d/--storage.tsdb.retention.time=15d/g' /etc/prometheus/prometheus.yml

    # Actualizar intervalo de scraping a 15s
    docker exec $PROJECT_NAME-prometheus sed -i 's/scrape_interval: 30s/scrape_interval: 15s/g' /etc/prometheus/prometheus.yml

    # Recargar configuración de Prometheus
    docker exec $PROJECT_NAME-prometheus kill -HUP 1

    # Restaurar límites de recursos en el compose file
    cp "$DOCKER_COMPOSE_FILE.bak" "$DOCKER_COMPOSE_FILE" 2>/dev/null || true

    # Aplicar cambios
    docker compose -f "$DOCKER_COMPOSE_FILE" up -d

    echo -e "${GREEN}Modo completo configurado correctamente${NC}"
}

# Verificar argumentos
if [ "$#" -eq 0 ]; then
    current_mode=$(get_current_status)
    echo -e "${BLUE}Estado actual del monitoreo: ${GREEN}$current_mode${NC}"
    print_usage
    exit 0
fi

MODE="$1"

case "$MODE" in
    off)
        echo -e "${YELLOW}Deteniendo servicios de monitoreo...${NC}"
        docker compose -f "$DOCKER_COMPOSE_FILE" down
        echo -e "${GREEN}Servicios de monitoreo detenidos${NC}"
        ;;
    light)
        # Verificar si los servicios están en ejecución
        if docker ps --format '{{.Names}}' | grep -q "$PROJECT_NAME-prometheus"; then
            configure_light_mode
        else
            echo -e "${YELLOW}Iniciando servicios de monitoreo en modo ligero...${NC}"
            # Ajustar recursos para modo ligero
            cp "$DOCKER_COMPOSE_FILE" "$DOCKER_COMPOSE_FILE.bak"
            sed -i 's/memory: 1G/memory: 512M/g' "$DOCKER_COMPOSE_FILE"
            sed -i 's/memory: 512M/memory: 256M/g' "$DOCKER_COMPOSE_FILE"
            sed -i 's/cpus: .1./cpus: 0.5/g' "$DOCKER_COMPOSE_FILE"

            # Ajustar retención en comando
            sed -i 's/--storage.tsdb.retention.time=15d/--storage.tsdb.retention.time=3d/g' "$DOCKER_COMPOSE_FILE"

            # Iniciar servicios
            docker compose -f "$DOCKER_COMPOSE_FILE" up -d

            echo -e "${GREEN}Servicios de monitoreo iniciados en modo ligero${NC}"
        fi
        ;;
    full)
        # Verificar si los servicios están en ejecución
        if docker ps --format '{{.Names}}' | grep -q "$PROJECT_NAME-prometheus"; then
            configure_full_mode
        else
            echo -e "${YELLOW}Iniciando servicios de monitoreo en modo completo...${NC}"

            # Restaurar configuración original si existe
            if [ -f "$DOCKER_COMPOSE_FILE.bak" ]; then
                cp "$DOCKER_COMPOSE_FILE.bak" "$DOCKER_COMPOSE_FILE"
            fi

            # Iniciar servicios
            docker compose -f "$DOCKER_COMPOSE_FILE" up -d

            echo -e "${GREEN}Servicios de monitoreo iniciados en modo completo${NC}"
        fi
        ;;
    *)
        echo -e "${RED}Modo desconocido: $MODE${NC}"
        print_usage
        exit 1
        ;;
esac

echo -e "${BLUE}==========================================================${NC}"
echo -e "${GREEN}Configuración de modo de monitoreo completada: $MODE${NC}"
echo -e "${BLUE}==========================================================${NC}"
