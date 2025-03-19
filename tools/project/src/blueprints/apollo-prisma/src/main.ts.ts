import { GeneratorOptions } from '../../types';

export function srcMainTs(options: GeneratorOptions): string {
  return `import express from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import { PrismaClient } from '@prisma/client';
import * as amqp from 'amqplib';

// Inicializar Prisma
const prisma = new PrismaClient();

// Variables para RabbitMQ
let channel: amqp.Channel;
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@rabbitmq:5672';
const SCRAPER_QUEUE = process.env.SCRAPER_QUEUE || 'scraper_tasks';
const RESULT_QUEUE = process.env.RESULT_QUEUE || 'result_queue';

// Configuración de Express
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Conectar a RabbitMQ
async function setupRabbitMQ() {
  try {
    // Intentar conectar hasta 5 veces con un retraso de 5 segundos
    let connection;
    let retries = 0;

    while (!connection && retries < 5) {
      try {
        connection = await amqp.connect(RABBITMQ_URL);
      } catch (error) {
        console.log(\`Error conectando a RabbitMQ (intento \${retries + 1}/5): \${error.message}\`);
        retries++;

        // Esperar 5 segundos antes de reintentar
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    if (!connection) {
      throw new Error('No se pudo conectar a RabbitMQ después de 5 intentos');
    }

    // Crear canal y declarar colas
    channel = await connection.createChannel();

    // Declarar cola de scraper
    await channel.assertQueue(SCRAPER_QUEUE, { durable: true });

    // Declarar cola de resultados
    await channel.assertQueue(RESULT_QUEUE, { durable: true });

    // Configurar consumidor para la cola de resultados
    await channel.consume(RESULT_QUEUE, async (msg) => {
      if (msg !== null) {
        try {
          // Procesar el mensaje
          const content = JSON.parse(msg.content.toString());
          console.log('Resultado recibido:', content);

          // Actualizar el check en la base de datos
          await updateCheckResult(content);

          // Confirmar que el mensaje ha sido procesado
          channel.ack(msg);
        } catch (error) {
          console.error('Error procesando resultado:', error);
          channel.nack(msg);
        }
      }
    });

    console.log('Conexión establecida con RabbitMQ');
  } catch (error) {
    console.error('Error configurando RabbitMQ:', error);
    throw error;
  }
}

// Función para actualizar el resultado de un check
async function updateCheckResult(result) {
  try {
    const { id, url, text, timestamp } = result;

    // Buscar el check existente
    const check = await prisma.check.findUnique({ where: { id } });

    if (!check) {
      console.error(\`Check no encontrado: \${id}\`);
      return;
    }

    // Actualizar el check con el resultado
    await prisma.check.update({
      where: { id },
      data: {
        status: 'completed',
        result: text,
        flow: [
          ...check.flow,
          {
            service: 'scraper',
            status: 'completed',
            timestamp,
            data: { url }
          }
        ]
      }
    });

    console.log(\`Check \${id} actualizado con éxito\`);
  } catch (error) {
    console.error('Error actualizando check:', error);
  }
}

// API Routes
app.get('/api/hello', (req, res) => {
  res.json({ message: 'Hola desde el servidor de ${options.projectName}!' });
});

// Endpoint para crear un nuevo check
app.post('/api/check', async (req, res) => {
  try {
    const checkId = uuidv4();
    const timestamp = new Date().toISOString();

    // Obtener URL del cuerpo de la petición o usar un valor por defecto
    const { url = 'https://en.wikipedia.org/wiki/Main_Page' } = req.body;

    // Crear un nuevo registro de check en la base de datos
    await prisma.check.create({
      data: {
        id: checkId,
        status: 'initiated',
        flow: [
          {
            service: 'app-server',
            status: 'initiated',
            timestamp,
            data: { url }
          }
        ]
      }
    });

    // Enviar mensaje a la cola de scraping
    if (channel) {
      const message = {
        id: checkId,
        url,
        selector: 'h1', // Selector básico para obtener los títulos principales
      };

      channel.sendToQueue(
        SCRAPER_QUEUE,
        Buffer.from(JSON.stringify(message)),
        { persistent: true }
      );

      console.log(\`Mensaje enviado a la cola: \${SCRAPER_QUEUE}\`);
    } else {
      console.warn('Canal de RabbitMQ no disponible');
    }

    // Devolver el ID del check para seguimiento
    res.json({ id: checkId, status: 'initiated' });
  } catch (error) {
    console.error('Error creando check:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Endpoint para obtener el estado de un check
app.get('/api/check/:id', async (req, res) => {
  try {
    const checkId = req.params.id;

    // Buscar el check en la base de datos
    const check = await prisma.check.findUnique({
      where: { id: checkId }
    });

    if (!check) {
      return res.status(404).json({ error: 'Check no encontrado' });
    }

    // Devolver información del check
    res.json(check);
  } catch (error) {
    console.error(\`Error obteniendo check \${req.params.id}:\`, error);
    res.status(500).json({ error: 'Error interno del servidor' });
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

// Iniciar la aplicación
async function bootstrap() {
  try {
    // Conectar a RabbitMQ
    await setupRabbitMQ();

    // Iniciar el servidor Express
    const server = app.listen(PORT, () => {
      console.log(\`Servidor ejecutándose en http://localhost:\${PORT}\`);
    });

    return server;
  } catch (error) {
    console.error('Error iniciando la aplicación:', error);
    process.exit(1);
  }
}

// Ejecutar la aplicación
bootstrap().catch(err => {
  console.error('Error no capturado:', err);
  process.exit(1);
});

export { app, bootstrap };`;
}
