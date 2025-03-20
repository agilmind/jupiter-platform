import { Logger } from './interfaces';

export class ConsoleLogger implements Logger {
  private prefix: string;

  constructor(prefix: string = 'worker') {
    this.prefix = prefix;
  }

  info(message: string, meta?: Record<string, any>): void {
    console.log(`[${this.prefix}] [INFO] ${message}`, meta || '');
  }

  warn(message: string, meta?: Record<string, any>): void {
    console.warn(`[${this.prefix}] [WARN] ${message}`, meta || '');
  }

  error(message: string, meta?: Record<string, any>): void {
    console.error(`[${this.prefix}] [ERROR] ${message}`, meta || '');
  }

  debug(message: string, meta?: Record<string, any>): void {
    console.debug(`[${this.prefix}] [DEBUG] ${message}`, meta || '');
  }
}
