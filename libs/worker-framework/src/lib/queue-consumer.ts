import * as amqp from 'amqplib';
import { QueueConfig, WorkerTask } from './types';
import { createLogger } from './utils/logger';

const logger = createLogger('queue-consumer');

/**
 * Gestiona la conexión y consumo de mensajes de RabbitMQ
 */
export class QueueConsumer {
  private config: QueueConfig;
  private connection: amqp.Connection | null = null;
  private channel: amqp.Channel | null = null;

  constructor(config: QueueConfig) {
    this.config = config;
    logger.debug('QueueConsumer initialized', { 
      host: config.host, 
      port: config.port,
      mainQueue: config.mainQueue 
    });
  }

  /**
   * Configura la conexión y las colas de RabbitMQ
   */
  async setup(): Promise<void> {
    try {
      // Crear conexión
      const url = `amqp://${this.config.user}:${this.config.password}@${this.config.host}:${this.config.port}`;
      // Usar casting para evitar errores de TypeScript
      this.connection = await amqp.connect(url) as unknown as amqp.Connection;
      
      // Crear canal
      if (this.connection) {
        // Usar casting para los métodos que TypeScript no reconoce
        this.channel = await (this.connection as any).createChannel() as amqp.Channel;
        
        // Configurar prefetch
        if (this.channel) {
          await this.channel.prefetch(this.config.prefetch);
          
          // Configurar colas
          await this.setupQueues();
          
          // Manejar cierre de conexión
          (this.connection as any).on('close', () => {
            logger.warn('RabbitMQ connection closed');
            this.connection = null;
            this.channel = null;
          });
          
          logger.info('RabbitMQ connection established', { 
            host: this.config.host, 
            port: this.config.port 
          });
        } else {
          throw new Error('Failed to create channel');
        }
      } else {
        throw new Error('Failed to establish connection');
      }
    } catch (error) {
      logger.error('Failed to setup RabbitMQ connection', { 
        error: error instanceof Error ? error.message : String(error),
        host: this.config.host,
        port: this.config.port
      });
      throw error;
    }
  }

  /**
   * Configura las colas necesarias para el sistema de workers
   */
  private async setupQueues(): Promise<void> {
    if (!this.channel) {
      throw new Error('Channel not initialized');
    }
    
    // Cola de reintentos con TTL dinámico
    await this.channel.assertExchange('retry_exchange', 'direct', { durable: true });
    
    // Cola de mensajes fallidos permanentemente
    await this.channel.assertQueue(this.config.deadLetterQueue, { durable: true });
    
    // Cola principal con reenvío a cola de reintentos
    await this.channel.assertQueue(this.config.mainQueue, {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': 'retry_exchange',
        'x-dead-letter-routing-key': this.config.retryQueue
      }
    });
    
    // Cola de reintentos que enruta de vuelta a la cola principal
    await this.channel.assertQueue(this.config.retryQueue, {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': '',
        'x-dead-letter-routing-key': this.config.mainQueue
      }
    });
    
    // Binding de la cola de reintentos
    await this.channel.bindQueue(
      this.config.retryQueue, 
      'retry_exchange', 
      this.config.retryQueue
    );
    
    logger.info('RabbitMQ queues setup complete', {
      mainQueue: this.config.mainQueue,
      retryQueue: this.config.retryQueue,
      deadLetterQueue: this.config.deadLetterQueue
    });
  }

  /**
   * Comienza a consumir mensajes de la cola principal
   * @param processCallback Función a llamar cuando se recibe un mensaje
   */
  async consume<T extends WorkerTask>(
    processCallback: (task: T, channel: amqp.Channel) => Promise<boolean>
  ): Promise<void> {
    if (!this.channel) {
      throw new Error('Channel not initialized');
    }
    
    this.channel.consume(this.config.mainQueue, async (msg) => {
      if (!msg || !this.channel) return;
      
      try {
        const content = msg.content.toString();
        const task = JSON.parse(content) as T;
        
        logger.debug(`Received message`, { 
          id: task.id, 
          type: task.type,
          retryCount: task.retryCount || 0
        });
        
        // Procesar el mensaje
        const success = await processCallback(task, this.channel);
        
        if (success) {
          // Confirmar procesamiento exitoso
          this.channel.ack(msg);
        } else {
          // El mensaje ya ha sido reenviado a otra cola
          this.channel.ack(msg);
        }
      } catch (error) {
        logger.error('Error processing message', { 
          error: error instanceof Error ? error.message : String(error),
          content: msg.content.toString()
        });
        
        // Rechazar para volver a encolar
        if (this.channel) {
          this.channel.nack(msg, false, true);
        }
      }
    });
    
    logger.info(`Started consuming from queue ${this.config.mainQueue}`);
  }

  /**
   * Envía un mensaje a la cola de reintentos con un TTL específico
   * @param task La tarea a reintentar
   * @param delayMs El tiempo de espera antes del reintento en ms
   */
  async scheduleRetry<T extends WorkerTask>(task: T, delayMs: number): Promise<void> {
    if (!this.channel) {
      throw new Error('Channel not initialized');
    }
    
    await this.channel.sendToQueue(
      this.config.retryQueue,
      Buffer.from(JSON.stringify(task)),
      {
        persistent: true,
        expiration: Math.floor(delayMs).toString() // TTL como string
      }
    );
    
    logger.debug(`Scheduled retry for task`, { 
      id: task.id, 
      delayMs,
      retryCount: task.retryCount
    });
  }

  /**
   * Envía una tarea a la cola de mensajes fallidos
   * @param task La tarea que falló permanentemente
   * @param errorMessage El mensaje de error
   */
  async sendToDeadLetterQueue<T extends WorkerTask>(task: T, errorMessage: string): Promise<void> {
    if (!this.channel) {
      throw new Error('Channel not initialized');
    }
    
    await this.channel.sendToQueue(
      this.config.deadLetterQueue,
      Buffer.from(JSON.stringify({
        ...task,
        error: errorMessage,
        failedAt: new Date().toISOString()
      })),
      { persistent: true }
    );
    
    logger.debug(`Sent task to dead letter queue`, { 
      id: task.id, 
      error: errorMessage
    });
  }

  /**
   * Cierra la conexión con RabbitMQ
   */
  async close(): Promise<void> {
    try {
      if (this.channel) {
        await this.channel.close();
        this.channel = null;
      }
      
      if (this.connection) {
        // Usar casting para el método close
        await (this.connection as any).close();
        this.connection = null;
      }
      
      logger.info('RabbitMQ connection closed');
    } catch (error) {
      logger.error('Error closing RabbitMQ connection', { 
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
}
