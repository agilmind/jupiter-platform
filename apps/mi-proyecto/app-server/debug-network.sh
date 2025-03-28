#!/bin/sh

# Script para depurar la conectividad entre contenedores Docker
echo "=== Iniciando diagnóstico de red ==="
echo "Hostname: $(hostname)"
echo "Dirección IP: $(hostname -i)"
echo "Variables de entorno:"
echo "PORT=$PORT"
echo "HOST=$HOST"
echo "NODE_ENV=$NODE_ENV"

echo "=== Verificando escucha de puertos ==="
# Instalar herramientas si es necesario
apk add --no-cache curl netcat-openbsd iputils

echo "Puertos en escucha:"
netstat -tulpn | grep LISTEN

echo "=== Verificando conectividad entre contenedores ==="
echo "Ping a web-app:"
ping -c 3 web-app || echo "No se pudo hacer ping"

echo "=== Prueba de conexión a GraphQL ==="
echo "Intentando conectar a http://localhost:4000/graphql"
curl -v http://localhost:4000/graphql || echo "Error conectando a GraphQL local"

echo "=== Comprobando procesos en ejecución ==="
ps aux

echo "=== Comprobando logs de NX ==="
cat /tmp/nx.log 2>/dev/null || echo "Archivo de log no encontrado"
