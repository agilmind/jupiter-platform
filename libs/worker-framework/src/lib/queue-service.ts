import { QueueConfig, Logger, WorkerTask } from './interfaces';

// Importar amqplib en forma que evita problemas de tipado
import * as amqplib from 'amqplib';

export class DefaultQueueService {
  private connection: any = null; // Usar any para evitar problemas de tipos
  private channel: any = null;
  private config: QueueConfig;
  private logger: Logger;

  constructor(config: QueueConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
  }

  async setup(): Promise<void> {
    try {
      // Conectar a RabbitMQ
      this.connection = await amqplib.connect(this.config.connectionUrl);
      this.channel = await this.connection.createChannel();

      // Configurar colas
      await this.channel.assertQueue(this.config.mainQueue, { durable: true });
      await this.channel.assertQueue(this.config.deadLetterQueue, { durable: true });
      await this.channel.assertQueue(this.config.retryQueue, {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': '',
          'x-dead-letter-routing-key': this.config.mainQueue
        }
      });

      this.channel.prefetch(this.config.prefetchCount);
      this.logger.info('Queue service initialized', { queues: this.config.mainQueue });
    } catch (error) {
      this.logger.error('Failed to setup queue service', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  async consume(handler: (task: WorkerTask) => Promise<boolean>): Promise<void> {
    if (!this.channel) {
      throw new Error('Channel not initialized');
    }

    this.channel.consume(this.config.mainQueue, async (msg: any) => {
      if (!msg) return;

      try {
        const content = msg.content.toString();
        const task = JSON.parse(content) as WorkerTask;

        const success = await handler(task);

        if (success) {
          this.channel.ack(msg);
        } else {
          // Si el handler devuelve false, significa que será manejado por otra lógica
          // No hacemos nada aquí
        }
      } catch (error) {
        this.logger.error('Error processing message', {
          error: error instanceof Error ? error.message : String(error)
        });

        // Rechazar el mensaje para que vuelva a la cola
        this.channel.nack(msg, false, true);
      }
    });

    this.logger.info('Started consuming from queue', { queue: this.config.mainQueue });
  }

  async sendToDeadLetterQueue(task: WorkerTask, errorMessage: string): Promise<void> {
    if (!this.channel) {
      throw new Error('Channel not initialized');
    }

    const message = {
      ...task,
      error: errorMessage,
      sentToDLQ: new Date().toISOString()
    };

    this.channel.sendToQueue(
      this.config.deadLetterQueue,
      Buffer.from(JSON.stringify(message)),
      { persistent: true }
    );

    this.logger.info('Sent task to dead letter queue', { taskId: task.id });
  }

  async scheduleRetry(task: WorkerTask, delay: number): Promise<void> {
    if (!this.channel) {
      throw new Error('Channel not initialized');
    }

    const message = {
      ...task,
      retryScheduled: new Date().toISOString(),
      retryCount: (task.retryCount || 0) + 1
    };

    this.channel.sendToQueue(
      this.config.retryQueue,
      Buffer.from(JSON.stringify(message)),
      {
        persistent: true,
        expiration: delay.toString()
      }
    );

    this.logger.info('Scheduled task for retry', {
      taskId: task.id,
      retryCount: message.retryCount,
      delay: `${delay}ms`
    });
  }

  async close(): Promise<void> {
    if (this.channel) {
      await this.channel.close();
    }

    if (this.connection) {
      await this.connection.close();
    }

    this.logger.info('Queue service closed');
  }
}
