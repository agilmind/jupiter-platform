const amqp = require('amqplib');
const { chromium } = require('playwright');

// Configuración
const RABBITMQ_URL =
  process.env.RABBITMQ_URL || 'amqp://guest:guest@rabbitmq:5672';
const SCRAPER_QUEUE = process.env.SCRAPER_QUEUE || 'scraper_tasks';
const RESULT_QUEUE = process.env.RESULT_QUEUE || 'result_queue';

async function startDebug() {
  console.log('=== SCRAPER WORKER DEBUG MODE ===');
  console.log(`RABBITMQ_URL: ${RABBITMQ_URL}`);
  console.log(`SCRAPER_QUEUE: ${SCRAPER_QUEUE}`);
  console.log(`RESULT_QUEUE: ${RESULT_QUEUE}`);
  console.log('================================');

  try {
    // Conectar a RabbitMQ
    console.log('Connecting to RabbitMQ...');
    const connection = await amqp.connect(RABBITMQ_URL);
    console.log('Connected to RabbitMQ successfully!');

    // Crear canal
    console.log('Creating channel...');
    const channel = await connection.createChannel();
    console.log('Channel created successfully!');

    // Declarar colas
    console.log(`Asserting queue: ${SCRAPER_QUEUE}`);
    await channel.assertQueue(SCRAPER_QUEUE, { durable: true });
    console.log(`Queue ${SCRAPER_QUEUE} asserted successfully!`);

    console.log(`Asserting queue: ${RESULT_QUEUE}`);
    await channel.assertQueue(RESULT_QUEUE, { durable: true });
    console.log(`Queue ${RESULT_QUEUE} asserted successfully!`);

    // Establecer prefetch
    console.log('Setting prefetch to 1...');
    channel.prefetch(1);

    // REGISTRO COMO CONSUMIDOR - PARTE CRÍTICA
    console.log(`Registering as consumer for ${SCRAPER_QUEUE}...`);
    channel.consume(SCRAPER_QUEUE, async (msg) => {
      if (msg === null) {
        console.log('Received null message, ignoring...');
        return;
      }

      try {
        console.log(`RECEIVED MESSAGE: ${msg.content.toString()}`);
        const task = JSON.parse(msg.content.toString());

        // Proceso básico de scraping
        console.log(`Processing URL: ${task.url}`);

        // Iniciar navegador
        const browser = await chromium.launch({ headless: true });
        const page = await browser.newPage();

        // Navegar a la URL
        await page.goto(task.url, { waitUntil: 'domcontentloaded' });

        // Extraer texto
        const text = await page
          .$eval('body', (el) => el.textContent || '')
          .catch((e) => 'Error extracting text');
        const trimmedText = text.trim().substring(0, 500);

        // Cerrar navegador
        await browser.close();

        // Crear resultado
        const result = {
          id: task.id,
          url: task.url,
          text: trimmedText,
          timestamp: new Date().toISOString(),
        };

        // Enviar resultado
        console.log(`Sending result to ${RESULT_QUEUE}`);
        channel.sendToQueue(RESULT_QUEUE, Buffer.from(JSON.stringify(result)), {
          persistent: true,
        });

        // Confirmar mensaje
        channel.ack(msg);
        console.log('Message processed and acknowledged');
      } catch (error) {
        console.error(`Error processing message: ${error.message}`);
        channel.nack(msg, false, false);
      }
    });

    console.log(`Consumer registered successfully for ${SCRAPER_QUEUE}!`);
    console.log('Waiting for messages...');

    // Mantener el proceso vivo
    process.on('SIGINT', async () => {
      console.log('Caught SIGINT, shutting down...');
      await channel.close();
      await connection.close();
      process.exit(0);
    });
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    console.error(error.stack);

    // Intentar reintentar en 5 segundos
    console.log('Retrying in 5 seconds...');
    setTimeout(startDebug, 5000);
  }
}

// Iniciar
startDebug();
