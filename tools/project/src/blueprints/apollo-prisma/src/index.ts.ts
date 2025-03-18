import { GeneratorOptions } from '../../types';

export function srcIndexTs(options: GeneratorOptions): string {
  const { projectName } = options;

  return `const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Ruta de prueba
app.get('/api/hello', (req, res) => {
  res.json({ message: 'Hola desde el servidor de ${projectName}!' });
});

// Health check
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

app.listen(PORT, () => {
  console.log(\`Servidor ejecutándose en http://localhost:\${PORT}\`);
});`;
}
