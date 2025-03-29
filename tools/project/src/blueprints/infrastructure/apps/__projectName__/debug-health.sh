#!/bin/sh
# Script para depurar el endpoint de health

echo "============== DIAGNÓSTICO DEL ENDPOINT DE HEALTH ==============="
echo "Fecha: $(date)"
echo "Servidor: http://localhost:4000/health"
echo ""

echo "Probando con curl:"
curl -v http://localhost:4000/health
echo ""

echo "Probando con wget:"
wget -O- http://localhost:4000/health
echo ""

echo "Verificando todos los puertos en escucha:"
netstat -tulpn
echo ""

echo "Verificando procesos Node en ejecución:"
ps aux | grep node
echo ""

echo "============== FIN DEL DIAGNÓSTICO ==============="
