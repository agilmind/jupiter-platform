import { GeneratorOptions } from '../../types';

export function srcMainTs(options: GeneratorOptions): string {
  const { projectName } = options;

  return `import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// API routes
app.get('/api/hello', (req, res) => {
  res.json({ message: 'Hola desde el servidor de ${projectName}!' });
});

// Health check
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).send('¡Algo salió mal!');
});

const server = app.listen(PORT, () => {
  console.log(\`Servidor ejecutándose en http://localhost:\${PORT}\`);
});

export default server;`;
}
