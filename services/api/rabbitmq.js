const amqp = require('amqplib');

// Configuración desde variables de entorno
const RABBITMQ_HOST = process.env.RABBITMQ_HOST || 'rabbitmq';
const RABBITMQ_PORT = process.env.RABBITMQ_PORT || 5672;
const RABBITMQ_USER = process.env.RABBITMQ_USER || 'rabbitmq';
const RABBITMQ_PASSWORD = process.env.RABBITMQ_PASSWORD || 'rabbitmq';
const RABBITMQ_QUEUE = process.env.RABBITMQ_QUEUE || 'tasks';

// URL de conexión a RabbitMQ
const RABBITMQ_URL = `amqp://${RABBITMQ_USER}:${RABBITMQ_PASSWORD}@${RABBITMQ_HOST}:${RABBITMQ_PORT}`;

// Variable para mantener la conexión
let connection = null;
let channel = null;

/**
 * Establece conexión con RabbitMQ
 */
async function connect() {
  try {
    // Si ya hay conexión, la retornamos
    if (connection && channel) {
      return { connection, channel };
    }

    // Establecer conexión
    connection = await amqp.connect(RABBITMQ_URL);

    // Crear canal
    channel = await connection.createChannel();

    // Asegurar que la cola existe
    await channel.assertQueue(RABBITMQ_QUEUE, { durable: true });

    console.log(`Conectado a RabbitMQ en ${RABBITMQ_HOST}:${RABBITMQ_PORT}`);

    // Manejar cierre de conexión
    connection.on('close', () => {
      console.log('Conexión a RabbitMQ cerrada');
      connection = null;
      channel = null;

      // Reintentar conexión después de un tiempo
      setTimeout(connect, 10000);
    });

    return { connection, channel };
  } catch (error) {
    console.error(`Error conectando a RabbitMQ: ${error.message}`);
    // Reintentar conexión después de un tiempo
    setTimeout(connect, 5000);
    return { connection: null, channel: null };
  }
}

/**
 * Envía un mensaje a la cola de RabbitMQ
 * @param {Object} message - Mensaje a enviar
 * @returns {Promise<boolean>} - Éxito del envío
 */
async function sendMessage(message) {
  try {
    // Asegurar conexión
    const { channel } = await connect();

    if (!channel) {
      console.error('No hay conexión con RabbitMQ');
      return false;
    }

    // Convertir mensaje a JSON
    const messageBuffer = Buffer.from(JSON.stringify(message));

    // Publicar mensaje
    await channel.sendToQueue(RABBITMQ_QUEUE, messageBuffer, {
      persistent: true,
      contentType: 'application/json'
    });

    console.log(`Mensaje enviado a cola ${RABBITMQ_QUEUE}: ${JSON.stringify(message)}`);
    return true;
  } catch (error) {
    console.error(`Error enviando mensaje a RabbitMQ: ${error.message}`);
    return false;
  }
}

/**
 * Cierra la conexión con RabbitMQ
 */
async function close() {
  try {
    if (channel) {
      await channel.close();
    }
    if (connection) {
      await connection.close();
    }
    console.log('Conexión a RabbitMQ cerrada correctamente');
  } catch (error) {
    console.error(`Error cerrando conexión a RabbitMQ: ${error.message}`);
  } finally {
    channel = null;
    connection = null;
  }
}

// Iniciar conexión al cargar el módulo
connect().catch(console.error);

// Manejar cierre de proceso
process.on('SIGINT', async () => {
  console.log('Cerrando conexión con RabbitMQ antes de terminar...');
  await close();
  process.exit(0);
});

module.exports = {
  connect,
  sendMessage,
  close
};