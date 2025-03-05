import { ApolloClient, InMemoryCache, HttpLink, gql } from '@apollo/client/core';
import fetch from 'cross-fetch';
import { GraphQLConfig, ProgressData } from './types';
import { createLogger } from './utils/logger';

const logger = createLogger('progress-reporter');

/**
 * Reporta el progreso de las tareas a través de GraphQL
 */
export class ProgressReporter {
  private client: ApolloClient<any>;
  private config: GraphQLConfig;

  constructor(config: GraphQLConfig) {
    this.config = config;
    
    // Crear Apollo Client
    this.client = new ApolloClient({
      link: new HttpLink({
        uri: config.endpoint,
        fetch,
        headers: {
          authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json'
        }
      }),
      cache: new InMemoryCache()
    });

    logger.debug('ProgressReporter initialized', { 
      endpoint: config.endpoint 
    });
  }

  /**
   * Reporta el progreso de una tarea
   * @param taskId ID de la tarea
   * @param data Datos de progreso a reportar
   */
  async reportProgress(taskId: string, data: ProgressData): Promise<void> {
    try {
      // Sanitizar datos para evitar campos nulos o indefinidos
      const sanitizedData = Object.entries(data).reduce((acc, [key, value]) => {
        if (value !== undefined && value !== null) {
          acc[key] = value;
        }
        return acc;
      }, {} as Record<string, any>);

      // Definir la mutation GraphQL
      const UPDATE_TASK_PROGRESS = gql`
        mutation UpdateTaskProgress($id: String!, $data: UpdateTaskProgressInput!) {
          updateTaskProgress(id: $id, data: $data) {
            id
            status
            progress
            currentStep
            updatedAt
          }
        }
      `;

      // Ejecución de la mutation
      await this.client.mutate({
        mutation: UPDATE_TASK_PROGRESS,
        variables: {
          id: taskId,
          data: sanitizedData
        }
      });

      logger.debug(`Reported progress for task ${taskId}`, { 
        status: data.status,
        progress: data.progress,
        step: data.currentStep
      });
      
    } catch (error) {
      logger.error(`Failed to report progress for task ${taskId}`, { 
        error: error instanceof Error ? error.message : String(error),
        data
      });
      
      // No lanzar error para que el worker pueda continuar
      // incluso si hay problemas de comunicación con GraphQL
    }
  }
}
