/**
 * Configuración de colas
 */
export interface QueueConfig {
  url: string;
  mainQueue: string;
  retryQueue: string;
  deadLetterQueue: string;
  prefetch: number;
}

/**
 * Configuración de reintentos
 */
export interface RetryConfig {
  maxRetries: number;
  backoffMultiplier: number;
}

/**
 * Configuración de GraphQL
 */
export interface GraphQLConfig {
  url: string;
}

/**
 * Configuración completa del worker
 */
export interface WorkerConfig {
  queue: QueueConfig;
  retry: RetryConfig;
  graphql: GraphQLConfig;
}

/**
 * Estados posibles de una tarea
 */
export enum TaskStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  RETRY_SCHEDULED = 'RETRY_SCHEDULED',
}

/**
 * Interfaz base para todas las tareas
 */
export interface WorkerTask {
  id: string;
  retryCount?: number;
  [key: string]: any;
}

/**
 * Registro de log para una tarea
 */
export interface TaskLog {
  timestamp: Date;
  level: 'info' | 'warning' | 'error' | 'debug';
  message: string;
  data?: Record<string, any>;
}

/**
 * Contexto de ejecución para una tarea
 */
export interface TaskContext {
  id: string;
  attempt: number;
  startedAt: Date;
  logs: TaskLog[];
}

/**
 * Actualización de progreso para una tarea
 */
export interface ProgressUpdate {
  status: TaskStatus;
  progress?: number;
  currentStep?: string;
  result?: string;
  errorMessage?: string;
  retryCount?: number;
  nextRetry?: string;
  lastAttempt?: string;
  completedAt?: string;
  failedAt?: string;
  logs?: TaskLog[];
}
