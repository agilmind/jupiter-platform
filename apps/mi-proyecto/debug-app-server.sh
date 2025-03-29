#!/bin/sh
# Script de diagnóstico para app-server en producción

echo "================ DIAGNÓSTICO DE APP-SERVER ================"
echo "Fecha: $(date)"
echo "Hostname: $(hostname)"
echo "Directorio actual: $(pwd)"

echo "\n================ VARIABLES DE ENTORNO ================"
echo "NODE_ENV=$NODE_ENV"
echo "HOST=$HOST"
echo "PORT=$PORT"
echo "DATABASE_URL=$DATABASE_URL"
echo "RABBITMQ_URL=$RABBITMQ_URL"
echo "RABBITMQ_HOST=$RABBITMQ_HOST"

echo "\n================ ESTRUCTURA DE DIRECTORIOS ================"
echo "Estructura del directorio /app:"
find /app -type f -name "*.js" | sort

echo "\n================ CONTENIDO DEL DIRECTORIO RAÍZ ================"
ls -la /app

echo "\n================ VERIFICANDO PUERTOS ================"
echo "Puertos en escucha:"
netstat -tulpn || echo "netstat no disponible"

echo "\n================ INTENTANDO EJECUTAR NODE ================"
node -v

echo "\n================ BÚSQUEDA AGRESIVA DE MAIN.JS ================"
find / -name "main.js" 2>/dev/null || echo "No se encontró main.js en el sistema"

echo "\n================ INFORMACIÓN DE RED ================"
ip addr || echo "ip addr no disponible"
cat /etc/hosts

echo "\n================ FIN DEL DIAGNÓSTICO ================"
