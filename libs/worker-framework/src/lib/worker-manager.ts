import {
  WorkerTask,
  TaskResult,
  TaskContext,
  TaskStatus,
  TaskHandler,
  QueueService,
  ProgressReporter,
  RetryStrategy,
  Logger,
} from './interfaces';

export class WorkerManager<T extends WorkerTask = WorkerTask, R extends TaskResult = TaskResult> {
  private taskHandler: TaskHandler<T, R>;
  private queueService: QueueService;
  private progressReporter: ProgressReporter;
  private retryStrategy: RetryStrategy;
  private logger: Logger;

  constructor(
    taskHandler: TaskHandler<T, R>,
    queueService: QueueService,
    progressReporter: ProgressReporter,
    retryStrategy: RetryStrategy,
    logger: Logger
  ) {
    this.taskHandler = taskHandler;
    this.queueService = queueService;
    this.progressReporter = progressReporter;
    this.retryStrategy = retryStrategy;
    this.logger = logger;
  }

  async start(): Promise<void> {
    try {
      // Inicializar servicios
      await this.queueService.setup();

      // Configurar manejo de tareas
      await this.queueService.consume(async (task) => {
        return this.processTask(task as T);
      });

      // Configurar manejo de señales del sistema
      this.setupShutdownHandlers();

      this.logger.info(`Worker started successfully`, {
        type: this.taskHandler.getWorkerType()
      });
    } catch (error) {
      this.logger.error('Failed to start worker', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  private async processTask(task: T): Promise<boolean> {
    // Crear contexto de ejecución
    const context: TaskContext = {
      startTime: new Date(),
      attempt: (task.retryCount || 0) + 1,
      logs: []
    };

    try {
      // Reportar inicio de procesamiento
      await this.progressReporter.reportProgress(task.id, {
        status: TaskStatus.PROCESSING,
        retryCount: task.retryCount,
        currentStep: this.taskHandler.getInitialStep(task),
        progress: 0,
        lastAttempt: new Date().toISOString()
      });

      this.logger.info(`Processing task ${task.id}`, {
        type: this.taskHandler.getWorkerType(),
        attempt: context.attempt
      });

      // Ejecutar la tarea específica
      const result = await this.taskHandler.execute(task, context);

      // Reportar éxito
      await this.progressReporter.reportProgress(task.id, {
        status: TaskStatus.COMPLETED,
        progress: 100,
        result: JSON.stringify(result),
        completedAt: new Date().toISOString(),
        logs: context.logs
      });

      this.logger.info(`Task ${task.id} completed successfully`, {
        type: this.taskHandler.getWorkerType(),
        attempt: context.attempt,
        duration: Date.now() - context.startTime.getTime()
      });

      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.logger.error(`Error processing task ${task.id}`, {
        error: errorMessage,
        type: this.taskHandler.getWorkerType(),
        attempt: context.attempt
      });

      // Verificar si el error es permanente o si se debe reintentar
      const isPermanent = this.taskHandler.isPermanentError(error, task) ||
                         !this.retryStrategy.shouldRetry(error, task.retryCount || 0);

      if (isPermanent) {
        // Marcar como fallido permanentemente
        await this.handlePermanentFailure(task, error, context);
      } else {
        // Programar reintento
        await this.scheduleRetry(task, error, context);
      }

      return false;
    }
  }

  private async handlePermanentFailure(task: T, error: unknown, context: TaskContext): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : String(error);

    this.logger.warn(`Marking task ${task.id} as permanently failed`, {
      attempt: context.attempt,
      error: errorMessage
    });

    // Actualizar estado
    await this.progressReporter.reportProgress(task.id, {
      status: TaskStatus.FAILED,
      errorMessage: errorMessage,
      failedAt: new Date().toISOString(),
      logs: context.logs
    });

    // Enviar a la cola de fallidos
    await this.queueService.sendToDeadLetterQueue(task, errorMessage);
  }

  private async scheduleRetry(task: T, error: unknown, context: TaskContext): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const retryCount = task.retryCount || 0;
    const retryDelay = this.retryStrategy.getRetryDelay(retryCount);
    const nextRetryDate = new Date(Date.now() + retryDelay);

    this.logger.info(`Scheduling retry for task ${task.id}`, {
      attempt: context.attempt,
      nextRetryIn: `${retryDelay / 1000}s`,
      nextRetryAt: nextRetryDate.toISOString()
    });

    // Actualizar estado
    await this.progressReporter.reportProgress(task.id, {
      status: TaskStatus.RETRY_SCHEDULED,
      errorMessage: errorMessage,
      nextRetry: nextRetryDate.toISOString(),
      logs: context.logs
    });

    // Programar reintento
    await this.queueService.scheduleRetry(task, retryDelay);
  }

  private setupShutdownHandlers(): void {
    const shutdown = async (signal: string) => {
      this.logger.info(`Received ${signal}, shutting down gracefully`);
      await this.shutdown();
      process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    process.on('uncaughtException', async (error) => {
      this.logger.error('Uncaught exception', {
        error: error.message,
        stack: error.stack
      });
      await this.shutdown();
      process.exit(1);
    });
  }

  async shutdown(): Promise<void> {
    try {
      await this.queueService.close();
      this.logger.info('Worker shut down successfully');
    } catch (error) {
      this.logger.error('Error during shutdown', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
}
