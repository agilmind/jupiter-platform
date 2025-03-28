#!/bin/sh

# Script para depurar la conectividad entre contenedores Docker
echo "=== Iniciando diagnóstico de red para worker ==="
echo "Hostname: $(hostname)"
echo "Dirección IP: $(hostname -i)"
echo "Variables de entorno:"
echo "HOST=$HOST"
echo "NODE_ENV=$NODE_ENV"
echo "RABBITMQ_URL=$RABBITMQ_URL"
echo "DATABASE_URL=$DATABASE_URL"

echo "=== Verificando escucha de puertos ==="
# Instalar herramientas si es necesario
apk add --no-cache curl netcat-openbsd iputils

echo "Puertos en escucha:"
netstat -tulpn | grep LISTEN

echo "=== Verificando conectividad entre contenedores ==="
echo "Ping a app-server:"
ping -c 3 mi-proyecto-app-server
if [ $? -ne 0 ]; then
    echo "No se pudo hacer ping"
fi

echo "Ping a RabbitMQ:"
ping -c 3 mi-proyecto-rabbitmq
if [ $? -ne 0 ]; then
    echo "No se pudo hacer ping"
fi

echo "=== Comprobando procesos en ejecución ==="
ps aux

echo "=== Análisis de la conexión RabbitMQ ==="
echo "Intentando conectar a RabbitMQ Management:"
curl -v http://mi-proyecto-rabbitmq:15672
if [ $? -ne 0 ]; then
    echo "No se pudo conectar a RabbitMQ management"
fi

echo "=== Comprobando resolución de nombres DNS ==="
echo "Resolviendo app-server:"
getent hosts mi-proyecto-app-server

echo "Resolviendo rabbitmq:"
getent hosts mi-proyecto-rabbitmq

echo "Resolviendo postgres:"
getent hosts mi-proyecto-postgres

echo "=== Comprobando conexión a puertos específicos ==="
echo "Conexión a RabbitMQ puerto 5672:"
nc -zv mi-proyecto-rabbitmq 5672

echo "Conexión a app-server puerto 4000:"
nc -zv mi-proyecto-app-server 4000

echo "Conexión a postgres puerto 5432:"
nc -zv mi-proyecto-postgres 5432
