/**
 * Estados posibles de una tarea
 */
export enum TaskStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  RETRY_SCHEDULED = 'RETRY_SCHEDULED',
  FAILED = 'FAILED',
  CANCELED = 'CANCELED'
}

/**
 * Interfaz base para todas las tareas de worker
 */
export interface WorkerTask {
  id: string;
  type: string;
  retryCount?: number;
  priority?: number;
  createdAt?: string;
  createdBy?: string;
  metadata?: Record<string, any>;
  [key: string]: any; // Propiedades adicionales específicas de la tarea
}

/**
 * Contexto de ejecución de una tarea
 */
export interface TaskContext {
  attempt: number;
  startTime: Date;
  logs: TaskLog[];
  [key: string]: any; // Contexto adicional específico de la implementación
}

/**
 * Entrada de log durante la ejecución de una tarea
 */
export interface TaskLog {
  timestamp: Date;
  level: 'info' | 'warning' | 'error' | 'debug';
  message: string;
  data?: Record<string, any>;
}

/**
 * Datos de progreso para reportar
 */
export interface ProgressData {
  status: TaskStatus;
  progress?: number;
  currentStep?: string;
  retryCount?: number;
  messageId?: string;
  errorMessage?: string;
  result?: string;
  sentAt?: string;
  completedAt?: string;
  lastAttempt?: string;
  nextRetry?: string;
  failedAt?: string;
  logs?: TaskLog[];
  [key: string]: any; // Datos adicionales específicos de la implementación
}

/**
 * Configuración para el consumidor de cola
 */
export interface QueueConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  mainQueue: string;
  retryQueue: string;
  deadLetterQueue: string;
  prefetch: number;
}

/**
 * Configuración para la gestión de reintentos
 */
export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  backoffFactor: number;
  maxDelayMs: number;
  jitterFactor?: number;
}

/**
 * Configuración para el cliente GraphQL
 */
export interface GraphQLConfig {
  endpoint: string;
  apiKey: string;
  timeout?: number;
}

/**
 * Configuración global del worker
 */
export interface WorkerConfig {
  queue: QueueConfig;
  retry: RetryConfig;
  graphql: GraphQLConfig;
  logLevel?: string;
  concurrency?: number;
  [key: string]: any; // Configuración adicional específica de la implementación
}

/**
 * Error específico del worker
 */
export class WorkerError extends Error {
  readonly permanent: boolean;
  readonly code?: string;
  readonly data?: Record<string, any>;

  constructor(message: string, options: {
    permanent?: boolean;
    code?: string;
    data?: Record<string, any>;
    cause?: Error;
  } = {}) {
    super(message);
    this.name = 'WorkerError';
    this.permanent = options.permanent || false;
    this.code = options.code;
    this.data = options.data;
  }

  /**
   * Crea un error permanente (no se reintentará)
   */
  static permanent(message: string, options: {
    code?: string;
    data?: Record<string, any>;
    cause?: Error;
  } = {}): WorkerError {
    return new WorkerError(message, { ...options, permanent: true });
  }

  /**
   * Crea un error temporal (se reintentará)
   */
  static temporary(message: string, options: {
    code?: string;
    data?: Record<string, any>;
    cause?: Error;
  } = {}): WorkerError {
    return new WorkerError(message, { ...options, permanent: false });
  }
}
