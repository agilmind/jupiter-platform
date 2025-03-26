"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DefaultProgressReporter = void 0;
const logger_1 = require("./utils/logger");
class DefaultProgressReporter {
    constructor(config, logger) {
        this.config = config;
        this.logger = logger || (0, logger_1.createLogger)('progress-reporter');
    }
    async reportProgress(taskId, update) {
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
        }
        catch (error) {
            this.logger.error('Failed to report progress', {
                taskId,
                error: error instanceof Error ? error.message : String(error)
            });
            // No relanzar el error para evitar interrumpir el flujo principal
        }
    }
}
exports.DefaultProgressReporter = DefaultProgressReporter;
