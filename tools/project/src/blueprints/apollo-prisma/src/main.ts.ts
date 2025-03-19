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

// Mejor detección del entorno
function isRunningInDocker() {
  // Si existe la variable de entorno explícita, la usamos
  if (process.env.LOCAL_DEV === 'true') {
    return false;
  }

  // Intentamos determinar automáticamente si estamos en un contenedor Docker
  try {
    // En muchos contenedores Docker, existe el archivo /.dockerenv
    const fs = require('fs');
    if (fs.existsSync('/.dockerenv')) {
      return true;
    }

    // Otra forma de verificar es buscando "docker" en /proc/1/cgroup
    const cgroups = fs.readFileSync('/proc/1/cgroup', 'utf8');
    return cgroups.includes('docker');
  } catch (e) {
    // Si hay algún error, asumimos que no estamos en Docker
    return false;
  }
}

const isInDocker = isRunningInDocker();
const isLocalDev = !isInDocker;

const RABBITMQ_HOST = isLocalDev ? 'localhost' : 'rabbitmq';
const RABBITMQ_URL = process.env.RABBITMQ_URL || \`amqp://guest:guest@\${RABBITMQ_HOST}:5672\`;
const SCRAPER_QUEUE = process.env.SCRAPER_QUEUE || 'scraper_tasks';
const RESULT_QUEUE = process.env.RESULT_QUEUE || 'result_queue';

console.log(\`Modo de ejecución: \${isLocalDev ? 'Desarrollo Local' : 'Docker'}\`);
console.log(\`Usando RabbitMQ URL: \${RABBITMQ_URL}\`);

// Configuración de Express
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Conectar a RabbitMQ
async function setupRabbitMQ() {
  try {
    // Intentar conectar hasta 10 veces con un retraso de 5 segundos
    let connection;
    let retries = 0;
    const maxRetries = 10;  // Aumentar a 10 intentos

    while (!connection && retries < maxRetries) {
      try {
        console.log(\`Intentando conectar a RabbitMQ: \${RABBITMQ_URL} (intento \${retries + 1}/\${maxRetries})\`);
        connection = await amqp.connect(RABBITMQ_URL);
      } catch (error) {
        console.log(\`Error conectando a RabbitMQ (intento \${retries + 1}/\${maxRetries}): \${error.message}\`);
        retries++;

        // Esperar más tiempo entre reintentos
        const delay = 5000 + (retries * 1000);  // Delay incremental
        console.log(\`Esperando \${delay / 1000} segundos antes de reintentar...\`);
        await new Promise(resolve => setTimeout(resolve, delay));
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

    // Verificar si el scraper está disponible
    const scraperAvailable = await checkScraperAvailability();

    if (channel && scraperAvailable) {
      // Enviar mensaje a la cola normalmente
      const message = { id: checkId, url, selector: 'h1' };
      channel.sendToQueue(SCRAPER_QUEUE, Buffer.from(JSON.stringify(message)), { persistent: true });
      console.log(\`Mensaje enviado a la cola: \${SCRAPER_QUEUE}\`);
    } else {
      // Modo fallback - simular resultado después de un tiempo
      console.warn('Usando modo fallback para el scraper');
      setTimeout(async () => {
        try {
          const fallbackResult = {
            id: checkId,
            url,
            text: \`[MODO FALLBACK] Texto simulado para la URL: \${url}. El servicio de scraper no está disponible.\`,
            timestamp: new Date().toISOString()
          };

          await updateCheckResult(fallbackResult);
          console.log('Resultado fallback procesado');
        } catch (error) {
          console.error('Error generando resultado fallback:', error);
        }
      }, 3000);
    }

    // Devolver el ID del check para seguimiento
    res.json({ id: checkId, status: 'initiated' });
  } catch (error) {
    // ... manejador de errores
  }
});

// Función para verificar si el scraper está disponible
async function checkScraperAvailability() {
  if (!channel) return false;

  try {
    // Verificar si hay consumidores en la cola
    const queueInfo = await channel.checkQueue(SCRAPER_QUEUE);
    return queueInfo.consumerCount > 0;
  } catch (error) {
    console.warn('Error verificando disponibilidad del scraper:', error.message);
    return false;
  }
}

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
    // Primero inicializamos la base de datos en modo desarrollo
    if (process.env.NODE_ENV !== 'production') {
      console.log('Inicializando esquema de base de datos...');
      try {
        // Usar prisma.$executeRaw para crear la tabla si no existe
        await prisma.$executeRaw\`
          CREATE TABLE IF NOT EXISTS "Check" (
            "id" TEXT NOT NULL,
            "status" TEXT NOT NULL,
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" TIMESTAMP(3) NOT NULL,
            "flow" JSONB[],
            "result" TEXT,
            CONSTRAINT "Check_pkey" PRIMARY KEY ("id")
          )
        \`;
        console.log('Esquema de base de datos inicializado');
      } catch (error) {
        console.warn('Error inicializando esquema:', error);
        console.warn('Es posible que necesites ejecutar migraciones manualmente con "npx prisma migrate dev"');
      }
    }

    // Conectar a RabbitMQ (si falla, continuamos sin él)
    try {
      await setupRabbitMQ();
    } catch (error) {
      console.warn('Continuando sin conexión a RabbitMQ:', error.message);
    }

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
