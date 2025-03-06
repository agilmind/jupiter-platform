import { 
  BaseWorker, 
  WorkerTask, 
  TaskContext, 
  WorkerError,
  WorkerConfig,
  createLogger
} from '@jupiter/worker-framework';
import * as nodemailer from 'nodemailer';

const logger = createLogger('email-worker');

// Interface para tareas de email
export interface EmailTask extends WorkerTask {
  to: string;
  from?: string;
  subject: string;
  html?: string;
  text?: string;
  attachments?: Array<{
    filename: string;
    content: string;
    contentType?: string;
  }>;
}

// Resultado del envío de email
export interface EmailResult {
  messageId: string;
  sentAt: string;
}

// Configuración específica del email worker
export interface EmailWorkerConfig extends WorkerConfig {
  email: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    password: string;
    from: string;
    rateLimit?: {
      minIntervalMs?: number;
      maxPerSecond?: number;
      maxPerMinute?: number;
    };
  };
}

/**
 * Worker para envío de emails
 */
export class EmailWorker extends BaseWorker<EmailTask, EmailResult> {
  private transporter: nodemailer.Transporter;
  private lastSendTime: Date = new Date();
  private emailConfig: EmailWorkerConfig['email'];
  
  constructor(config: EmailWorkerConfig) {
    super(config);
    this.emailConfig = config.email;
    
    logger.info('Email worker created', { 
      host: config.email.host,
      port: config.email.port
    });
  }
  
  /**
   * Devuelve el tipo de worker para logs
   */
  protected getWorkerType(): string {
    return 'email';
  }
  
  /**
   * Inicializa el transporter de nodemailer
   */
  protected async initialize(): Promise<void> {
    try {
      // Crear el transporter de Nodemailer
      this.transporter = nodemailer.createTransport({
        host: this.emailConfig.host,
        port: this.emailConfig.port,
        secure: this.emailConfig.secure,
        auth: {
          user: this.emailConfig.user,
          pass: this.emailConfig.password
        },
        tls: {
          rejectUnauthorized: true
        }
      });
      
      // Verificar la conexión
      await this.transporter.verify();
      
      logger.info('Email transporter initialized successfully', { 
        host: this.emailConfig.host,
        port: this.emailConfig.port
      });
    } catch (error) {
      logger.error('Failed to initialize email transporter', { 
        error: error instanceof Error ? error.message : String(error),
        host: this.emailConfig.host,
        port: this.emailConfig.port
      });
      throw error;
    }
  }
  
  /**
   * Aplica rate limiting si es necesario
   */
  private async applyRateLimit(): Promise<void> {
    const minInterval = this.emailConfig.rateLimit?.minIntervalMs || 1000; // 1 segundo por defecto
    
    const now = new Date();
    const elapsed = now.getTime() - this.lastSendTime.getTime();
    
    if (elapsed < minInterval) {
      const waitTime = minInterval - elapsed;
      logger.debug(`Rate limiting: waiting ${waitTime}ms before sending`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastSendTime = new Date();
  }
  
  /**
   * Envía un email
   */
  protected async executeTask(task: EmailTask, context: TaskContext): Promise<EmailResult> {
    this.log(context, 'info', `Sending email to ${task.to}`, { subject: task.subject });
    
    try {
      // Aplicar rate limiting si está configurado
      await this.applyRateLimit();
      
      // Crear mensaje
      const message = {
        from: task.from || this.emailConfig.from,
        to: task.to,
        subject: task.subject,
        text: task.text || '',
        html: task.html,
        attachments: task.attachments || []
      };
      
      // Enviar email
      const result = await this.transporter.sendMail(message);
      
      this.log(context, 'info', `Email sent successfully to ${task.to}`, { 
        messageId: result.messageId,
        response: result.response
      });
      
      return {
        messageId: result.messageId,
        sentAt: new Date().toISOString()
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      this.log(context, 'error', `Failed to send email to ${task.to}`, { 
        error: errorMessage,
        subject: task.subject
      });
      
      // Relanzar para que lo maneje el mecanismo de reintentos
      throw error;
    }
  }
  
  /**
   * Determina si un error es permanente
   */
  protected isPermanentError(error: any, task: EmailTask): boolean {
    // Códigos de error SMTP que indican fallos permanentes
    const permanentFailureCodes = [
      550, // Mailbox unavailable
      551, // User not local
      553, // Mailbox name invalid
      501, // Syntax error in parameters
      421, // Service not available
    ];
    
    // Si es un WorkerError, usar su propiedad permanent
    if (error instanceof WorkerError) {
      return error.permanent;
    }
    
    // Comprobar código de error SMTP
    if (error.responseCode && permanentFailureCodes.includes(error.responseCode)) {
      return true;
    }
    
    // Comprobar mensajes de error específicos
    const permanentErrorPatterns = [
      /spam/i,
      /blocked/i,
      /invalid.*address/i,
      /no.*such.*user/i,
      /address.*rejected/i,
      /blacklist/i,
    ];
    
    const errorMessage = error.message || error.toString();
    return permanentErrorPatterns.some(pattern => pattern.test(errorMessage));
  }
  
  /**
   * Devuelve el paso inicial para esta tarea
   */
  protected getInitialStep(task: EmailTask): string {
    return `Preparando envío de email a ${task.to}`;
  }
  
  /**
   * Cierra las conexiones
   */
  protected async shutdown(): Promise<void> {
    try {
      this.transporter?.close();
      logger.info('Email transporter closed');
    } catch (error) {
      logger.error('Error closing email transporter', { 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
    
    // Llamar al método de la clase base
    await super.shutdown();
  }
}
