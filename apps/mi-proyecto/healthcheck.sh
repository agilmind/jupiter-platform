#!/bin/sh
# Script mejorado para healthcheck que proporciona diagnóstico si falla

# Comprobar si el proceso node está en ejecución
if ! pgrep -x "node" > /dev/null; then
  echo "ERROR: Proceso node no está en ejecución"
  ps aux
  exit 1
fi

# Intentar acceder al endpoint de health
response=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:$PORT/health)

if [ "$response" = "200" ]; then
  echo "Healthcheck OK: Servicio respondiendo correctamente"
  exit 0
else
  echo "ERROR: Healthcheck falló. Código de respuesta: $response"

  # Intentar obtener más información
  echo "Intentando obtener respuesta detallada:"
  curl -v http://localhost:$PORT/health

  # Comprobar puertos en escucha
  echo "Puertos en escucha:"
  netstat -tulpn || echo "netstat no disponible"

  exit 1
fi
