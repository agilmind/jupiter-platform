export interface WorkerTask {
  id: string;
  retryCount?: number;
  [key: string]: any;
}

export interface TaskResult {
  id: string;
  [key: string]: any;
}

export interface TaskContext {
  startTime: Date;
  attempt: number;
  logs: TaskLog[];
}

export enum TaskStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  RETRY_SCHEDULED = 'retry_scheduled',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

export interface WorkerConfig {
  queue: QueueConfig;
  retry: RetryConfig;
  graphql: GraphQLConfig;
  [key: string]: any;
}

export interface QueueConfig {
  connectionUrl: string;   // Nueva versión usa URL completa
  mainQueue: string;
  deadLetterQueue: string;
  retryQueue: string;
  prefetchCount: number;

  // Estas propiedades faltan y están generando los errores:
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  prefetch?: number;
}

export interface RetryConfig {
  maxRetries: number;
  initialDelay: number;
  backoffFactor: number;
  maxDelay: number;
}

export interface GraphQLConfig {
  endpoint: string;
  apiKey?: string;
}

/**
 * Interfaz que define un procesador de tareas
 * Responsable de ejecutar la lógica específica del worker
 */
export interface TaskHandler<T extends WorkerTask = WorkerTask, R extends TaskResult = TaskResult> {
  execute(task: T, context: TaskContext): Promise<R>;
  isPermanentError(error: unknown, task: T): boolean;
  getInitialStep(task: T): string;
  getWorkerType(): string;
}


export interface TaskLog {
  timestamp: Date;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  data?: Record<string, any>;
}

/**
 * Interfaz para el servicio de cola
 * Abstrae la interacción con el sistema de mensajería
 */
export interface QueueService {
  setup(): Promise<void>;
  consume(handler: (task: WorkerTask) => Promise<boolean>): Promise<void>;
  sendToDeadLetterQueue(task: WorkerTask, errorMessage: string): Promise<void>;
  scheduleRetry(task: WorkerTask, delay: number): Promise<void>;
  close(): Promise<void>;
}

/**
 * Interfaz para reportar progreso
 * Abstrae la comunicación con el sistema principal
 */
export interface ProgressReporter {
  reportProgress(taskId: string, update: {
    status?: TaskStatus;
    progress?: number;
    currentStep?: string;
    errorMessage?: string;
    retryCount?: number;
    nextRetry?: string;
    result?: string;
    completedAt?: string;
    failedAt?: string;
    lastAttempt?: string;
    logs?: TaskLog[];
  }): Promise<void>;
}

/**
 * Interfaz para el manejo de reintentos
 */
export interface RetryStrategy {
  getRetryDelay(retryCount: number): number;
  shouldRetry(error: unknown, retryCount: number): boolean;
}

/**
 * Interfaz para logging
 */
export interface Logger {
  info(message: string, meta?: Record<string, any>): void;
  warn(message: string, meta?: Record<string, any>): void;
  error(message: string, meta?: Record<string, any>): void;
  debug(message: string, meta?: Record<string, any>): void;
}
