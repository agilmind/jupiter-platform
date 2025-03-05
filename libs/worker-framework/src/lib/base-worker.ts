import { Channel } from 'amqplib';
import { QueueConsumer } from './queue-consumer';
import { RetryManager } from './retry-manager';
import { ProgressReporter } from './progress-reporter';
import { createLogger } from './utils/logger';
import { 
  WorkerTask, 
  TaskStatus, 
  WorkerConfig, 
  TaskContext, 
  TaskLog 
} from './types';

const logger = createLogger('base-worker');

/**
 * Clase base abstracta para todos los workers
 * Define el flujo de trabajo común y los puntos de extensión
 */
export abstract class BaseWorker<T extends WorkerTask, R = any> {
  protected queueConsumer: QueueConsumer;
  protected retryManager: RetryManager;
  protected progressReporter: ProgressReporter;
  protected config: WorkerConfig;

  constructor(config: WorkerConfig) {
    this.config = config;
    this.queueConsumer = new QueueConsumer(config.queue);
    this.retryManager = new RetryManager(config.retry);
    this.progressReporter = new ProgressReporter(config.graphql);
    
    logger.info('Worker initialized', { 
      type: this.getWorkerType(),
      queue: config.queue.mainQueue
    });
  }

  /**
   * Inicializa el worker y comienza a procesar tareas
   */
  public async start(): Promise<void> {
    try {
      // Inicializar conexiones
      await this.initialize();
      
      // Configurar el consumidor de cola
      await this.queueConsumer.setup();
      
      // Comenzar a consumir tareas
      await this.queueConsumer.consume(async (task: T, channel: Channel) => {
        return this.processTask(task, channel);
      });
      
      logger.info('Worker started successfully', { type: this.getWorkerType() });
      
      // Manejar señales de terminación
      this.setupShutdownHandlers();
    } catch (error) {
      logger.error('Failed to start worker', { 
        error: error instanceof Error ? error.message : String(error),
        type: this.getWorkerType()
      });
      throw error;
    }
  }

  /**
   * Procesa una tarea individual
   * Implementa el flujo común con puntos de extensión
   */
  protected async processTask(task: T, channel: Channel): Promise<boolean> {
    // Crea el contexto de ejecución
    const context: TaskContext = {
      attempt: (task.retryCount || 0) + 1,
      startTime: new Date(),
      logs: []
    };
    
    try {
      // Actualizar contador de intentos
      task.retryCount = context.attempt - 1;
      
      // Reportar inicio de procesamiento
      await this.progressReporter.reportProgress(task.id, {
        status: TaskStatus.PROCESSING,
        retryCount: task.retryCount,
        currentStep: this.getInitialStep(task),
        progress: 0,
        lastAttempt: new Date().toISOString()
      });
      
      logger.info(`Processing task ${task.id}`, { 
        type: this.getWorkerType(),
        attempt: context.attempt
      });
      
      // Ejecutar la tarea específica (implementada por la subclase)
      const result = await this.executeTask(task, context);
      
      // Reportar éxito
      await this.progressReporter.reportProgress(task.id, {
        status: TaskStatus.COMPLETED,
        progress: 100,
        result: JSON.stringify(result),
        completedAt: new Date().toISOString()
      });
      
      logger.info(`Task ${task.id} completed successfully`, {
        type: this.getWorkerType(),
        attempt: context.attempt,
        duration: Date.now() - context.startTime.getTime()
      });
      
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      logger.error(`Error processing task ${task.id}`, { 
        error: errorMessage,
        type: this.getWorkerType(),
        attempt: context.attempt
      });
      
      // Verificar si el error es permanente o si se debe reintentar
      // Corregir posible undefined en task.retryCount
      const isPermanent = this.isPermanentError(error, task) || 
                          (task.retryCount || 0) >= this.config.retry.maxRetries;
      
      if (isPermanent) {
        // Marcar como fallido permanentemente
        await this.handlePermanentFailure(task, error, channel, context);
        return false;
      } else {
        // Programar reintento
        await this.scheduleRetry(task, error, channel, context);
        return false;
      }
    }
  }
  
  /**
   * Registra un log en el contexto de la tarea
   */
  protected log(
    context: TaskContext, 
    level: 'info' | 'warning' | 'error' | 'debug', 
    message: string, 
    data?: Record<string, any>
  ): void {
    const logEntry: TaskLog = {
      timestamp: new Date(),
      level,
      message,
      data
    };
    
    context.logs.push(logEntry);
    
    // También enviar al logger global
    logger[level](message, { taskContext: true, ...data });
  }
  
  /**
   * Maneja un fallo permanente
   */
  protected async handlePermanentFailure(
    task: T, 
    error: any, 
    channel: Channel,
    context: TaskContext
  ): Promise<void> {
    logger.warn(`Marking task ${task.id} as permanently failed`, {
      attempt: context.attempt,
      error: error instanceof Error ? error.message : String(error)
    });
    
    // Actualizar estado vía GraphQL
    await this.progressReporter.reportProgress(task.id, {
      status: TaskStatus.FAILED,
      errorMessage: error instanceof Error ? error.message : String(error),
      failedAt: new Date().toISOString(),
      logs: context.logs
    });
    
    // Enviar a la cola de fallidos para revisión manual
    await this.queueConsumer.sendToDeadLetterQueue(
      task,
      error instanceof Error ? error.message : String(error)
    );
  }
  
  /**
   * Programa un reintento de la tarea
   */
  protected async scheduleRetry(
    task: T, 
    error: any, 
    channel: Channel,
    context: TaskContext
  ): Promise<void> {
    // Corregir retryCount undefined
    const retryCount = task.retryCount || 0;
    const retryDelay = this.retryManager.getRetryDelay(retryCount);
    const nextRetryDate = new Date(Date.now() + retryDelay);
    
    logger.info(`Scheduling retry for task ${task.id}`, {
      attempt: context.attempt,
      nextRetryIn: `${retryDelay / 1000}s`,
      nextRetryAt: nextRetryDate.toISOString()
    });
    
    // Actualizar estado vía GraphQL
    await this.progressReporter.reportProgress(task.id, {
      status: TaskStatus.RETRY_SCHEDULED,
      errorMessage: error instanceof Error ? error.message : String(error),
      nextRetry: nextRetryDate.toISOString(),
      logs: context.logs
    });
    
    // Enviar a la cola de reintentos con TTL apropiado
    await this.queueConsumer.scheduleRetry(task, retryDelay);
  }
  
  /**
   * Configura manejadores para señales de apagado
   */
  private setupShutdownHandlers(): void {
    process.on('SIGINT', async () => {
      logger.info('Received SIGINT, shutting down gracefully');
      await this.shutdown();
      process.exit(0);
    });
    
    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM, shutting down gracefully');
      await this.shutdown();
      process.exit(0);
    });
    
    process.on('uncaughtException', async (error) => {
      logger.error('Uncaught exception', { 
        error: error.message, 
        stack: error.stack 
      });
      await this.shutdown();
      process.exit(1);
    });
  }
  
  /**
   * Cierra las conexiones y libera recursos
   */
  protected async shutdown(): Promise<void> {
    try {
      await this.queueConsumer.close();
      logger.info('Worker shut down successfully');
    } catch (error) {
      logger.error('Error during shutdown', { 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  }
  
  /**
   * Inicializa recursos específicos del worker
   * Método a implementar por subclases
   * Quita 'async' del método abstracto para resolver error TS1243
   */
  protected abstract initialize(): Promise<void>;
  
  /**
   * Ejecuta la lógica específica de la tarea
   * Método principal a implementar por subclases
   * Quita 'async' del método abstracto para resolver error TS1243
   */
  protected abstract executeTask(task: T, context: TaskContext): Promise<R>;
  
  /**
   * Determina si un error es permanente (no se debe reintentar)
   * Puede ser sobrescrito por subclases para lógica específica
   */
  protected abstract isPermanentError(error: any, task: T): boolean;
  
  /**
   * Retorna el tipo de worker para logging
   */
  protected abstract getWorkerType(): string;
  
  /**
   * Retorna el paso inicial para esta tarea
   */
  protected abstract getInitialStep(task: T): string;
}
