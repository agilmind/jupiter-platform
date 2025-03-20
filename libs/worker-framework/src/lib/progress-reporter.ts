import { ProgressReporter, Logger, GraphQLConfig, TaskStatus, TaskLog } from './interfaces';
import { createLogger } from './utils/logger';

export class DefaultProgressReporter implements ProgressReporter {
  private config: GraphQLConfig;
  private logger: Logger;

  constructor(config: GraphQLConfig, logger?: Logger) {
    this.config = config;
    this.logger = logger || createLogger('progress-reporter');
  }

  async reportProgress(taskId: string, update: {
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
  }): Promise<void> {
    try {
      // Construir la mutación GraphQL
      const mutation = `
        mutation UpdateTaskProgress($taskId: ID!, $input: TaskProgressInput!) {
          updateTaskProgress(taskId: $taskId, input: $input) {
            success
            message
          }
        }
      `;

      const variables = {
        taskId,
        input: {
          ...update,
          // Convertir logs a formato serializable si existen
          logs: update.logs ? update.logs.map(log => ({
            ...log,
            timestamp: log.timestamp.toISOString()
          })) : undefined
        }
      };

      // Realizar solicitud GraphQL
      const response = await fetch(this.config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.apiKey ? { 'Authorization': `Bearer ${this.config.apiKey}` } : {})
        },
        body: JSON.stringify({
          query: mutation,
          variables
        })
      });

      const result = await response.json();

      if (result.errors) {
        throw new Error(`GraphQL error: ${JSON.stringify(result.errors)}`);
      }

      this.logger.debug('Progress reported successfully', { taskId, status: update.status });
    } catch (error) {
      this.logger.error('Failed to report progress', {
        taskId,
        error: error instanceof Error ? error.message : String(error)
      });
      // No relanzar el error para evitar interrumpir el flujo principal
    }
  }
}
