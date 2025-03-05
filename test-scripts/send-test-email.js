#!/usr/bin/env node
require('dotenv').config();
const amqp = require('amqplib');

// Configuración
const config = {
  rabbitmq: {
    host: process.env.RABBITMQ_HOST || 'localhost',
    port: parseInt(process.env.RABBITMQ_PORT || '5672', 10),
    user: process.env.RABBITMQ_USER || 'guest',
    password: process.env.RABBITMQ_PASSWORD || 'guest',
    url: `amqp://${process.env.RABBITMQ_USER || 'guest'}:${process.env.RABBITMQ_PASSWORD || 'guest'}@${process.env.RABBITMQ_HOST || 'localhost'}:${process.env.RABBITMQ_PORT || '5672'}`
  },
  queue: process.env.EMAIL_QUEUE || 'emails_jupiter'
};

// Mensaje de email de prueba
const testEmail = {
  id: `test-${Date.now()}`,
  type: 'email',
  to: process.env.TEST_EMAIL_TO || 'fido@agilmind.com.ar',
  from: process.env.EMAIL_FROM || 'agilmind.app@gmail.com',
  subject: 'Test Email from Worker Framework',
  text: 'This is a test email sent through the Worker Framework.',
  html: '<h1>Test Email</h1><p>This is a test email sent through the <strong>Worker Framework</strong>.</p>'
};

// Función para enviar mensaje a la cola
async function sendTestEmail() {
  try {
    // Conectar a RabbitMQ
    console.log(`Connecting to RabbitMQ at ${config.rabbitmq.host}:${config.rabbitmq.port}...`);
    const connection = await amqp.connect(config.rabbitmq.url);
    const channel = await connection.createChannel();

    // No intentar declarar la cola - simplemente comprobar que existe
    console.log(`Checking if queue ${config.queue} exists...`);
    try {
      await channel.checkQueue(config.queue);
      console.log(`Queue ${config.queue} exists, proceeding with send.`);
    } catch (error) {
      console.error(`Queue ${config.queue} does not exist or cannot be accessed:`, error.message);
      throw error;
    }

    // Enviar mensaje
    console.log(`Sending test email to ${testEmail.to} using queue ${config.queue}...`);
    channel.sendToQueue(
      config.queue,
      Buffer.from(JSON.stringify(testEmail)),
      { persistent: true }
    );

    console.log('Test email sent to queue!');
    console.log('Message:', JSON.stringify(testEmail, null, 2));

    // Cerrar conexión después de un breve retraso para asegurar el envío
    setTimeout(async () => {
      await channel.close();
      await connection.close();
      console.log('Connection closed');
    }, 500);
  } catch (error) {
    console.error('Error sending test email:', error);
    process.exit(1);
  }
}

// Ejecutar
sendTestEmail();
