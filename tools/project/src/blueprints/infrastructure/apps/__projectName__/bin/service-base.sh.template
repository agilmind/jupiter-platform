#!/bin/sh
# ===========================================================================
# Script base para inicialización de servicios - Compatible con Alpine
# Proporciona funciones comunes para todos los servicios
#
# NOTA: Este script está diseñado para funcionar con múltiples instancias
# de servicios (web-apps, workers, etc.) con nombres diferentes
# ===========================================================================

# Colores para mensajes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Función para mensajes de log
log_info() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
  echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
  echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

# Función para esperar a que un servicio esté disponible
wait_for_service() {
  service_name="$1"
  host="$2"
  port="$3"
  max_retries="${4:-30}"
  endpoint="${5:-/health}"

  log_info "Esperando que $service_name esté disponible en $host:$port$endpoint..."
  retries=0

  until curl -s "http://$host:$port$endpoint" > /dev/null 2>&1; do
    retries=$((retries+1))

    if [ $retries -ge $max_retries ]; then
      log_warning "$service_name no está disponible después de $max_retries intentos."
      log_warning "Continuando de todas formas, pero el servicio podría no funcionar correctamente."
      return 1
    fi

    log_info "Intento $retries/$max_retries - $service_name no está listo, esperando 5 segundos..."
    sleep 5
  done

  log_success "$service_name está disponible."
  return 0
}

# Función para mostrar información del entorno
show_environment() {
  service_name="$1"

  echo "====================== $service_name ======================="
  echo "Fecha: $(date)"
  echo "Hostname: $(hostname)"
  echo "IP: $(hostname -i 2>/dev/null || echo 'No disponible')"
  echo "Directorio actual: $(pwd)"
  echo "NODE_ENV: ${NODE_ENV:-no definido}"
  echo "==============================================="
}

# Función para verificar variables de entorno requeridas
check_required_vars() {
  missing=0
  for var in "$@"; do
    if [ -z "$(eval echo \$$var)" ]; then
      log_error "Variable de entorno requerida no definida: $var"
      missing=1
    fi
  done

  if [ $missing -eq 1 ]; then
    return 1
  fi
  return 0
}

# Función para detectar el tipo de servicio basado en el nombre del contenedor o variables
detect_service_type() {
  # Intentar obtener del hostname (que suele ser el nombre del contenedor)
  hostname=$(hostname)

  # Si está disponible en variable de entorno, usar eso
  if [ -n "$SERVICE_TYPE" ]; then
    echo "$SERVICE_TYPE"
    return 0
  fi

  # Detectar por nombre si contiene patrones específicos
  if echo "$hostname" | grep -q "web"; then
    echo "web-app"
    return 0
  elif echo "$hostname" | grep -q "worker"; then
    echo "worker"
    return 0
  elif echo "$hostname" | grep -q "server"; then
    echo "app-server"
    return 0
  fi

  # Si no podemos detectar, solicitar el tipo
  log_warning "No se pudo detectar el tipo de servicio automáticamente."
  log_info "Se asumirá que es un servicio genérico."
  echo "generic"
  return 1
}

# Función para obtener el nombre corto del servicio (sin el prefijo del proyecto)
get_service_name() {
  hostname=$(hostname)

  # Si hay un SERVICE_NAME en las variables de entorno, usarlo
  if [ -n "$SERVICE_NAME" ]; then
    echo "$SERVICE_NAME"
    return 0
  fi

  # Intentar extraer después del guión
  if echo "$hostname" | grep -q "-"; then
    echo "$hostname" | awk -F'-' '{for(i=2;i<=NF;i++) printf "%s%s", (i>2?"-":""), $i}'
    return 0
  fi

  # Si no podemos extraer, devolver el hostname completo
  echo "$hostname"
  return 0
}
