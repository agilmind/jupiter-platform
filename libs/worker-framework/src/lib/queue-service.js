"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DefaultQueueService = void 0;
// Importar amqplib en forma que evita problemas de tipado
const amqplib = __importStar(require("amqplib"));
class DefaultQueueService {
    constructor(config, logger) {
        this.connection = null; // Usar any para evitar problemas de tipos
        this.channel = null;
        this.config = config;
        this.logger = logger;
    }
    async setup() {
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
        }
        catch (error) {
            this.logger.error('Failed to setup queue service', {
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }
    async consume(handler) {
        if (!this.channel) {
            throw new Error('Channel not initialized');
        }
        this.channel.consume(this.config.mainQueue, async (msg) => {
            if (!msg)
                return;
            try {
                const content = msg.content.toString();
                const task = JSON.parse(content);
                const success = await handler(task);
                if (success) {
                    this.channel.ack(msg);
                }
                else {
                    // Si el handler devuelve false, significa que será manejado por otra lógica
                    // No hacemos nada aquí
                }
            }
            catch (error) {
                this.logger.error('Error processing message', {
                    error: error instanceof Error ? error.message : String(error)
                });
                // Rechazar el mensaje para que vuelva a la cola
                this.channel.nack(msg, false, true);
            }
        });
        this.logger.info('Started consuming from queue', { queue: this.config.mainQueue });
    }
    async sendToDeadLetterQueue(task, errorMessage) {
        if (!this.channel) {
            throw new Error('Channel not initialized');
        }
        const message = {
            ...task,
            error: errorMessage,
            sentToDLQ: new Date().toISOString()
        };
        this.channel.sendToQueue(this.config.deadLetterQueue, Buffer.from(JSON.stringify(message)), { persistent: true });
        this.logger.info('Sent task to dead letter queue', { taskId: task.id });
    }
    async scheduleRetry(task, delay) {
        if (!this.channel) {
            throw new Error('Channel not initialized');
        }
        const message = {
            ...task,
            retryScheduled: new Date().toISOString(),
            retryCount: (task.retryCount || 0) + 1
        };
        this.channel.sendToQueue(this.config.retryQueue, Buffer.from(JSON.stringify(message)), {
            persistent: true,
            expiration: delay.toString()
        });
        this.logger.info('Scheduled task for retry', {
            taskId: task.id,
            retryCount: message.retryCount,
            delay: `${delay}ms`
        });
    }
    async close() {
        if (this.channel) {
            await this.channel.close();
        }
        if (this.connection) {
            await this.connection.close();
        }
        this.logger.info('Queue service closed');
    }
}
exports.DefaultQueueService = DefaultQueueService;
