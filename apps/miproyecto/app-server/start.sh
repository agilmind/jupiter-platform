#!/bin/sh

echo "==== Información del sistema ===="
echo "Node $(node -v)"
echo "NPM $(npm -v)"
echo "Hostname: $(hostname)"
echo "IP: $(ip addr | grep inet | grep -v '127.0.0.1' | awk '{print $2}' | cut -d/ -f1)"
echo "==============================="

echo "Verificando archivos NX..."
ls -la /app/apps/miproyecto/app-server/src/

echo "Esperando a que Postgres esté disponible..."
wget --quiet --tries=10 --spider http://postgres:5432 && echo "Postgres disponible" || echo "No se pudo conectar a Postgres"

# Asegurar que el endpoint de health existe para el healthcheck
mkdir -p /app/health-endpoint
cat > /app/health-endpoint/index.js << EOF
const http = require('http');
const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});
server.listen(3001, '0.0.0.0', () => {
  console.log('Health check server running on port 3001');
});
EOF

# Iniciar el servidor de health check en segundo plano
node /app/health-endpoint/index.js &
HEALTH_PID=$!

echo "Iniciando app-server en $HOST:$PORT..."
npx nx serve miproyecto-app-server --host=$HOST --port=$PORT

# Si llegamos aquí, la aplicación terminó, matar el servidor de health check
kill $HEALTH_PID
