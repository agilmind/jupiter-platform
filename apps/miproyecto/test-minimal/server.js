// Script simple de Express para probar conectividad
const express = require('express');
const cors = require('cors');
const app = express();

// Habilitar CORS para todas las peticiones
app.use(cors());

// Escuchar en todas las interfaces
const HOST = '0.0.0.0';
const PORT = 3000;

// Endpoint simple para probar
app.get('/api/hello', (req, res) => {
  console.log('Petición recibida en /api/hello');
  res.json({ message: 'Hola desde el servidor Express independiente' });
});

// Endpoint de health check
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Iniciar el servidor
app.listen(PORT, HOST, () => {
  console.log(`Servidor Express ejecutándose en http://${HOST}:${PORT}`);
  console.log('Endpoints disponibles:');
  console.log('  - GET /api/hello');
  console.log('  - GET /health');
});
