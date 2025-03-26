#!/bin/bash
# Script para diagnosticar problemas con app-server

# Colores para mejor lectura
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}===== Diagnóstico detallado de app-server =====${NC}"

# 1. Ver los logs completos del app-server
echo -e "${YELLOW}1. Logs completos del app-server:${NC}"
docker logs miproyecto-app-server-1

# 2. Verificar procesos en el contenedor
echo -e "\n${YELLOW}2. Procesos en ejecución dentro del contenedor:${NC}"
docker exec miproyecto-app-server-1 ps aux || echo "No se pudo ejecutar ps aux"

# 3. Verificar si el puerto está realmente escuchando
echo -e "\n${YELLOW}3. Verificando puertos en escucha:${NC}"
docker exec miproyecto-app-server-1 sh -c "netstat -tulpn 2>/dev/null || ss -tulpn 2>/dev/null || echo 'No se pudieron verificar los puertos en escucha'"

# 4. Instalar curl si no está disponible y probar la API dentro del contenedor
echo -e "\n${YELLOW}4. Verificando API dentro del contenedor:${NC}"
docker exec miproyecto-app-server-1 sh -c "
  if ! command -v curl &> /dev/null; then
    echo 'Instalando curl...'
    apk add --no-cache curl
  fi
  curl -v http://localhost:3000/api/hello || echo 'No se pudo conectar a la API dentro del contenedor'
"

# 5. Verificar conexión desde web-app a app-server
echo -e "\n${YELLOW}5. Verificando conexión desde web-app:${NC}"
docker exec miproyecto-web-app-1 sh -c "
  curl -v http://app-server:3000/api/hello || echo 'No se pudo conectar desde web-app a app-server'
"

# 6. Verificar configuración de red
echo -e "\n${YELLOW}6. Información de la red Docker:${NC}"
docker network inspect miproyecto-network | grep -A 10 "Containers"

# 7. Verificar script de arranque NX
echo -e "\n${YELLOW}7. Verificando comando que se está usando para iniciar la aplicación:${NC}"
docker exec miproyecto-app-server-1 sh -c "
  cd /app/apps/miproyecto/app-server &&
  echo 'Contenido del directorio:' &&
  ls -la &&
  echo 'Verificando NX:' &&
  npx nx --version || echo 'NX no está disponible'
"

echo -e "${GREEN}===== Diagnóstico Completo =====${NC}"
echo -e "${YELLOW}Basado en este diagnóstico, podemos determinar si el problema está en:${NC}"
echo "1. Inicialización de NX"
echo "2. Configuración de Express"
echo "3. Redes de Docker"
echo "4. Configuración de puertos"
