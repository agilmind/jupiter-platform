import { GeneratorOptions } from '../../types';

export function baseWorkerTs(options: GeneratorOptions): string {
  // Esto es una versión simplificada del BaseWorker que compartiste
  return `import {
  WorkerTask,
  TaskStatus,
  WorkerConfig,
  TaskContext,
  TaskLog
} from './types';

/**
 * Simulación de QueueConsumer, RetryManager y ProgressReporter
 * En una implementación real, estos se conectarían con RabbitMQ y GraphQL
 */
class QueueConsumer {
  constructor(private config: any) {}

  async setup() {
    console.log('Queue consumer setup with config:', this.config);
  }

  async consume(callback: any) {
    console.log('Ready to consume messages');
  }

  async sendToDeadLetterQueue(task: any, errorMessage: string) {
    console.log(\`Task \${task.id} sent to DLQ: \${errorMessage}\`);
  }

  async scheduleRetry(task: any, delay: number) {
    console.log(\`Retry scheduled for task \${task.id} in \${delay}ms\`);
  }

  async close() {
    console.log('Queue connections closed');
  }
}

class RetryManager {
  constructor(private config: any) {}

  getRetryDelay(retryCount: number): number {
    // Exponential backoff
    return Math.pow(2, retryCount) * this.config.backoffMultiplier;
  }
}

class ProgressReporter {
  constructor(private config: any) {}

  async reportProgress(taskId: string, update: any) {
    console.log(\`Progress for \${taskId}: \${update.status}\`);
  }
}

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

    console.log('Worker initialized', {
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
      await this.queueConsumer.consume(async (task: T, channel: any) => {
        return this.processTask(task, channel);
      });

      console.log('Worker started successfully', { type: this.getWorkerType() });

      // Manejar señales de terminación
      this.setupShutdownHandlers();
    } catch (error) {
      console.error('Failed to start worker', {
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
  protected async processTask(task: T, channel: any): Promise<boolean> {
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

      console.log(\`Processing task \${task.id}\`, {
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

      console.log(\`Task \${task.id} completed successfully\`, {
        type: this.getWorkerType(),
        attempt: context.attempt,
        duration: Date.now() - context.startTime.getTime()
      });

      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      console.error(\`Error processing task \${task.id}\`, {
        error: errorMessage,
        type: this.getWorkerType(),
        attempt: context.attempt
      });

      // Verificar si el error es permanente o si se debe reintentar
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
    console[level](message, { taskContext: true, ...data });
  }

  /**
   * Maneja un fallo permanente
   */
  protected async handlePermanentFailure(
    task: T,
    error: any,
    channel: any,
    context: TaskContext
  ): Promise<void> {
    console.warn(\`Marking task \${task.id} as permanently failed\`, {
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
    channel: any,
    context: TaskContext
  ): Promise<void> {
    const retryCount = task.retryCount || 0;
    const retryDelay = this.retryManager.getRetryDelay(retryCount);
    const nextRetryDate = new Date(Date.now() + retryDelay);

    console.log(\`Scheduling retry for task \${task.id}\`, {
      attempt: context.attempt,
      nextRetryIn: \`\${retryDelay / 1000}s\`,
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
      console.log('Received SIGINT, shutting down gracefully');
      await this.shutdown();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('Received SIGTERM, shutting down gracefully');
      await this.shutdown();
      process.exit(0);
    });
  }

  /**
   * Cierra las conexiones y libera recursos
   */
  protected async shutdown(): Promise<void> {
    try {
      await this.queueConsumer.close();
      console.log('Worker shut down successfully');
    } catch (error) {
      console.error('Error during shutdown', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Métodos abstractos a implementar por subclases
   */
  protected abstract initialize(): Promise<void>;
  protected abstract executeTask(task: T, context: TaskContext): Promise<R>;
  protected abstract isPermanentError(error: any, task: T): boolean;
  protected abstract getWorkerType(): string;
  protected abstract getInitialStep(task: T): string;
}`;
}
