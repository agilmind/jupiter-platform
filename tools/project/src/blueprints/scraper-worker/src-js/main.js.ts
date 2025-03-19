import { GeneratorOptions } from '../../types';

export function srcMainJs(options: GeneratorOptions): string {
  return `const amqp = require('amqplib');
const { chromium } = require('playwright');

// Configuración
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@rabbitmq:5672';
const SCRAPER_QUEUE = process.env.SCRAPER_QUEUE || 'scraper_tasks';
const RESULT_QUEUE = process.env.RESULT_QUEUE || 'result_queue';

async function extractTextFromPage(page, selector) {
  try {
    if (selector) {
      await page.waitForSelector(selector, { timeout: 5000 });
      const text = await page.$eval(selector, el => el.textContent || '');
      return text.trim();
    } else {
      const text = await page.$eval('body', el => el.textContent || '');
      return text.trim();
    }
  } catch (error) {
    console.error('Error extracting text:', error);
    return \`Error extracting text: \${error.message}\`;
  }
}

async function processScraperTask(channel, task) {
  console.log(\`Starting scraping for URL: \${task.url}\`);

  // Validate URL
  if (!task.url || !task.url.startsWith('http')) {
    throw new Error(\`Invalid URL: \${task.url}\`);
  }

  const browser = await chromium.launch({ headless: true });
  try {
    console.log('Navigating to page');

    const page = await browser.newPage();
    await page.goto(task.url, { waitUntil: 'domcontentloaded' });

    const text = await extractTextFromPage(page, task.selector);
    console.log(\`Text extracted (\${text.length} characters)\`);

    // Create result
    const result = {
      id: task.id,
      url: task.url,
      text: text.substring(0, 500), // Limit to 500 chars
      timestamp: new Date().toISOString()
    };

    // Send result to queue
    try {
      await channel.assertQueue(RESULT_QUEUE, { durable: true });
      channel.sendToQueue(
        RESULT_QUEUE,
        Buffer.from(JSON.stringify(result)),
        { persistent: true }
      );
      console.log(\`Result sent to queue \${RESULT_QUEUE}\`);
    } catch (error) {
      console.error(\`Error sending result: \${error.message}\`);
    }

    return result;
  } finally {
    await browser.close();
    console.log('Browser closed');
  }
}

async function startScraper() {
  console.log('Starting Scraper Worker...');

  try {
    // Connect to RabbitMQ
    console.log(\`Connecting to RabbitMQ: \${RABBITMQ_URL}\`);
    const connection = await amqp.connect(RABBITMQ_URL);

    // Handle connection close
    connection.on('close', () => {
      console.log('RabbitMQ connection closed');
      process.exit(1);
    });

    // Create channel
    const channel = await connection.createChannel();

    // Declare queues
    await channel.assertQueue(SCRAPER_QUEUE, { durable: true });
    await channel.assertQueue(RESULT_QUEUE, { durable: true });

    // Set prefetch (process one message at a time)
    channel.prefetch(1);

    console.log(\`Waiting for messages in \${SCRAPER_QUEUE}\`);

    // Consume messages
    channel.consume(SCRAPER_QUEUE, async (msg) => {
      if (msg === null) return;

      try {
        const task = JSON.parse(msg.content.toString());
        console.log(\`Received task: \${task.id}\`);

        await processScraperTask(channel, task);

        // Acknowledge message
        channel.ack(msg);
      } catch (error) {
        console.error(\`Error processing task: \${error.message}\`);
        channel.nack(msg, false, false); // Send to DLQ
      }
    });

    // Handle shutdown
    process.on('SIGINT', async () => {
      console.log('Caught SIGINT, shutting down');
      await channel.close();
      await connection.close();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('Caught SIGTERM, shutting down');
      await channel.close();
      await connection.close();
      process.exit(0);
    });
  } catch (error) {
    console.error(\`Error starting scraper: \${error.message}\`);
    process.exit(1);
  }
}

// Start the worker
startScraper();`;
}
