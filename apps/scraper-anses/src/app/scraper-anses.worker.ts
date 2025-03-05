import { 
  BaseWorker, 
  WorkerTask, 
  TaskContext, 
  WorkerError, 
  WorkerConfig,
  createLogger
} from '@jupiter/worker-framework';

const logger = createLogger('scraper-anses-worker');

// Interface para tareas específicas de este worker
export interface ScraperAnsesWorkerTask extends WorkerTask {
  // Define aquí los campos específicos para este tipo de tarea
  targetId?: string;
  data?: Record<string, any>;
  parameters?: Record<string, any>;
}

// Resultado de la ejecución de la tarea
export interface ScraperAnsesWorkerResult {
  // Define aquí los campos para el resultado de la tarea
  id: string;
  processedAt: string;
  status: string;
  data?: Record<string, any>;
}

// Configuración específica del worker
export interface ScraperAnsesWorkerConfig extends WorkerConfig {
  scraper: {
    // Configuración específica para este worker
    timeout: number;
    maxConcurrency: number;
  };
}

/**
 * Implementación de worker para scraper
 */
export class ScraperAnsesWorker extends BaseWorker<ScraperAnsesWorkerTask, ScraperAnsesWorkerResult> {
  private scraperConfig: ScraperAnsesWorkerConfig['scraper'];
  
  constructor(config: ScraperAnsesWorkerConfig) {
    super(config);
    this.scraperConfig = config.scraper;
    
    logger.info('ScraperAnsesWorker created', { 
      timeout: this.scraperConfig.timeout,
      maxConcurrency: this.scraperConfig.maxConcurrency
    });
  }
  
  /**
   * Devuelve el tipo de worker para logs
   */
  protected getWorkerType(): string {
    return 'scraper';
  }
  
  /**
   * Inicializa los recursos específicos del worker
   */
  protected async initialize(): Promise<void> {
    // Inicializar recursos específicos del worker
    // Ejemplo: conexión a bases de datos, servicios externos, etc.
    logger.info('ScraperAnsesWorker initialized');
  }
  
  /**
   * Ejecuta la lógica específica de la tarea
   */
  protected async executeTask(task: ScraperAnsesWorkerTask, context: TaskContext): Promise<ScraperAnsesWorkerResult> {
    this.log(context, 'info', `Executing task ${task.id}`, { type: task.type });
    
    try {
      // Implementar la lógica específica de la tarea
      // ...
      
      // Simulación - reemplaza con la lógica real
      this.log(context, 'info', 'Processing task...', { targetId: task.targetId });
      await new Promise(resolve => setTimeout(resolve, 1000));
      this.log(context, 'info', 'Task completed successfully');
      
      // Retornar resultado
      return {
        id: task.id,
        processedAt: new Date().toISOString(),
        status: 'completed',
        data: task.data
      };
    } catch (error) {
      this.log(context, 'error', `Error executing task ${task.id}`, { 
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Relanzar el error para que lo maneje el sistema de reintentos
      throw error;
    }
  }
  
  /**
   * Determina si un error es permanente
   */
  protected isPermanentError(error: any, task: ScraperAnsesWorkerTask): boolean {
    // Si es un WorkerError, usar su propiedad permanent
    if (error instanceof WorkerError) {
      return error.permanent;
    }
    
    // Implementar lógica específica para determinar errores permanentes
    // Ejemplo:
    const permanentErrorPatterns = [
      /not found/i,
      /invalid/i,
      /permission denied/i,
    ];
    
    const errorMessage = error.message || error.toString();
    return permanentErrorPatterns.some(pattern => pattern.test(errorMessage));
  }
  
  /**
   * Devuelve el paso inicial para la tarea
   */
  protected getInitialStep(task: ScraperAnsesWorkerTask): string {
    return `Iniciando procesamiento de tarea ${task.type}`;
  }
  
  /**
   * Cierra recursos y conexiones
   */
  protected async shutdown(): Promise<void> {
    try {
      // Cerrar recursos específicos
      logger.info('ScraperAnsesWorker resources closed');
    } catch (error) {
      logger.error('Error closing ScraperAnsesWorker resources', { 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
    
    // Llamar al método de la clase base para cerrar otras conexiones
    await super.shutdown();
  }
}
