import express from 'express';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { v4 as uuidv4 } from 'uuid';
import cors from 'cors';
import http from 'http';
import amqp from 'amqplib';
import { json } from 'body-parser';
import { makeExecutableSchema } from '@graphql-tools/schema';

// Memoria para almacenar nuestros procesos pendientes
const processes = new Map<
  string,
  {
    id: string;
    content: string;
    completed: boolean;
    result?: string;
  }
>();

// Definición del esquema GraphQL
const typeDefs = `#graphql
  type Process {
    id: ID!
    content: String!
    completed: Boolean!
    result: String
  }

  type Query {
    getProcess(id: ID!): Process
    healthCheck: String!
  }

  type Mutation {
    createProcess(content: String!): Process!
  }
`;

// Implementación de resolvers
const resolvers = {
  Query: {
    healthCheck: () => '¡El servidor está funcionando correctamente!',
    getProcess: (_: any, { id }: { id: string }) => {
      console.log(`🔍 Consultando estado del proceso: ${id}`);

      if (!processes.has(id)) {
        console.log(`❌ Proceso con ID ${id} no encontrado`);
        throw new Error(`Proceso con ID ${id} no encontrado`);
      }

      const process = processes.get(id);
      console.log(`✅ Estado del proceso ${id}:`, JSON.stringify(process, null, 2));
      return process;
    },
  },
  Mutation: {
    createProcess: async (_: any, { content }: { content: string }) => {
      const id = uuidv4();

      const taskProcess = {
        id,
        content,
        completed: false,
      };

      processes.set(id, taskProcess);
      console.log(`📝 Creado nuevo proceso: ${id}`);

      // Usar la misma URL que en el consumidor
      const rabbitmqUrl =
        process.env.RABBITMQ_URL || 'amqp://guest:guest@mi-proyecto-rabbitmq:5672';

      // Enviar a RabbitMQ
      try {
        console.log(`🔄 Conectando a RabbitMQ para enviar tarea: ${rabbitmqUrl}`);
        const connection = await amqp.connect(rabbitmqUrl);
        const channel = await connection.createChannel();

        const queue = 'worker-queue';
        await channel.assertQueue(queue, { durable: true });

        // Verificar estado de la cola
        const queueInfo = await channel.checkQueue(queue);
        console.log(
          `Cola ${queue} - mensajes: ${queueInfo.messageCount}, consumidores: ${queueInfo.consumerCount}`
        );

        // Enviar con persistencia
        const sent = channel.sendToQueue(queue, Buffer.from(JSON.stringify({ id, content })), {
          persistent: true,
        });

        if (sent) {
          console.log(`✅ Mensaje enviado a cola ${queue} con ID: ${id}`);
        } else {
          console.warn(`⚠️ Canal lleno, no se pudo enviar mensaje inmediatamente`);
        }

        await channel.close();
        await connection.close();
      } catch (error) {
        console.error('❌ Error al enviar a RabbitMQ:', error);
        throw new Error('Error al enviar el mensaje');
      }

      return taskProcess;
    },
  },
};

// Configuración para recibir mensajes de RabbitMQ
async function setupRabbitMQConsumer() {
  const MAX_RETRIES = 5;
  let retries = MAX_RETRIES;

  const connectWithRetry = async () => {
    while (retries > 0) {
      try {
        // Definir la cola aquí para evitar ReferenceError
        const queue = 'server-queue';

        // Usar la misma URL que en worker (rabbitmq en lugar de localhost)
        const rabbitmqUrl =
          process.env.RABBITMQ_URL || 'amqp://guest:guest@mi-proyecto-rabbitmq:5672';
        console.log(`Intentando conectar a RabbitMQ para consumir: ${rabbitmqUrl}`);

        const connection = await amqp.connect(rabbitmqUrl);
        console.log('✅ Conexión a RabbitMQ establecida para consumidor');

        connection.on('error', (err) => {
          console.error('❌ Error en la conexión RabbitMQ:', err);
          setTimeout(() => connectWithRetry(), 5000);
        });

        connection.on('close', () => {
          console.warn('⚠️ Conexión RabbitMQ cerrada, intentando reconectar...');
          setTimeout(() => connectWithRetry(), 5000);
        });

        const channel = await connection.createChannel();
        console.log('✅ Canal RabbitMQ creado para consumidor');

        await channel.assertQueue(queue, { durable: true });
        console.log(`✅ Cola ${queue} configurada para consumidor`);

        const checkInfo = await channel.checkQueue(queue);
        console.log(`✅ Estado actual de cola ${queue}:`, {
          mensajes: checkInfo.messageCount,
          consumidores: checkInfo.consumerCount,
        });

        console.log(`[*] Configurando consumidor para ${queue}`);

        channel.consume(queue, (msg) => {
          if (msg) {
            try {
              console.log(`🐰 Recibido mensaje de RabbitMQ:`, msg.content.toString());
              const content = JSON.parse(msg.content.toString());
              console.log(`📝 Procesando respuesta para proceso ${content.id}`);

              if (processes.has(content.id)) {
                const process = processes.get(content.id)!;
                console.log(`📊 Estado anterior:`, JSON.stringify(process, null, 2));

                process.completed = true;
                process.result = content.result;
                processes.set(content.id, process);

                console.log(`📊 Estado actualizado:`, JSON.stringify(process, null, 2));
                console.log(`✅ Proceso ${content.id} marcado como completado`);
              } else {
                console.log(`⚠️ Recibido resultado para proceso desconocido: ${content.id}`);
              }

              channel.ack(msg);
              console.log(`👍 Mensaje confirmado (ack)`);
            } catch (error) {
              console.error('❌ Error procesando mensaje de RabbitMQ:', error);
              channel.nack(msg, false, false);
            }
          }
        });

        console.log(`✅ Consumidor para ${queue} configurado correctamente`);
        return true;
      } catch (error) {
        retries--;
        console.error(`❌ Error al configurar RabbitMQ (intentos restantes: ${retries}):`, error);

        if (retries <= 0) {
          console.error('❌ Se agotaron los reintentos para conectar a RabbitMQ');
          return false;
        }

        console.log(`⏳ Esperando 5 segundos antes de reintentar...`);
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
  };

  return connectWithRetry();
}

// Inicialización del servidor
async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);

  // Endpoint para health check (REST)
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Servidor Apollo/GraphQL
  const schema = makeExecutableSchema({ typeDefs, resolvers });
  const server = new ApolloServer({ schema });
  await server.start();

  // Crea un router para GraphQL
  const graphqlRouter = express.Router();
  graphqlRouter.use(cors(), json());
  graphqlRouter.use(expressMiddleware(server) as any);

  // Monta el router en la app
  app.use('/graphql', graphqlRouter);

  // Iniciar servidor
  const PORT = process.env.PORT || 4000;
  httpServer.listen(PORT, () => {
    console.log(`🚀 Servidor listo en http://localhost:${PORT}`);
    console.log(`📊 GraphQL disponible en http://localhost:${PORT}/graphql`);
  });

  // Configurar consumidor RabbitMQ con manejo mejorado de errores
  console.log('Configurando consumidor RabbitMQ...');
  try {
    await setupRabbitMQConsumer();
    console.log('Consumidor RabbitMQ configurado correctamente.');
  } catch (error) {
    console.error(
      'Error al configurar consumidor RabbitMQ, pero el servidor HTTP seguirá funcionando:',
      error
    );
    // No propagamos el error para que el servidor HTTP siga funcionando
  }
}

// Esperar un tiempo para que RabbitMQ esté listo
console.log('Esperando 10 segundos para asegurar que RabbitMQ esté listo...');
setTimeout(() => {
  startServer().catch((err) => {
    console.error('Error al iniciar el servidor:', err);
  });
}, 10000); // Esperar 10 segundos
