import { GeneratorOptions } from '../../types';

export function srcMainTs(options: GeneratorOptions): string {
  const { projectName } = options;

  return `import express from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';

// Base de datos en memoria (temporal, luego usaremos Prisma)
const checks = new Map();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// API Routes
app.get('/api/hello', (req, res) => {
  res.json({ message: 'Hola desde el servidor de ${projectName}!' });
});

// Endpoint para crear un nuevo check
app.post('/api/check', (req, res) => {
  const checkId = uuidv4();
  const timestamp = new Date().toISOString();

  // Crear un nuevo registro de check
  const checkData = {
    id: checkId,
    status: 'initiated',
    createdAt: timestamp,
    flow: [
      {
        service: 'app-server',
        timestamp,
        status: 'initiated'
      }
    ]
  };

  // Guardar en nuestra "base de datos" en memoria
  checks.set(checkId, checkData);

  // En un sistema real, aquí enviaríamos el mensaje a RabbitMQ
  console.log(\`Check iniciado: \${checkId}\`);

  // Devolver el ID del check para seguimiento
  res.json({ id: checkId, status: 'initiated' });
});

// Endpoint para obtener el estado de un check
app.get('/api/check/:id', (req, res) => {
  const checkId = req.params.id;

  if (checks.has(checkId)) {
    res.json(checks.get(checkId));
  } else {
    res.status(404).json({ error: 'Check no encontrado' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('¡Algo salió mal!');
});

const server = app.listen(PORT, () => {
  console.log(\`Servidor ejecutándose en http://localhost:\${PORT}\`);
});

export default server;`;
}
