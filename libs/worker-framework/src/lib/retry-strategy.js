"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExponentialBackoffStrategy = void 0;
class ExponentialBackoffStrategy {
    constructor(config) {
        this.config = config;
    }
    getRetryDelay(retryCount) {
        const exponentialDelay = this.config.initialDelay * Math.pow(this.config.backoffFactor, retryCount);
        const delay = Math.min(exponentialDelay, this.config.maxDelay);
        // Añadir un poco de aleatorización (jitter) para evitar tormentas de reintentos
        return delay + Math.random() * 1000;
    }
    shouldRetry(error, retryCount) {
        // Verificar si hemos alcanzado el número máximo de reintentos
        if (retryCount >= this.config.maxRetries) {
            return false;
        }
        // Verificar si el error es permanente (por defecto, casi todos son retentables)
        if (error instanceof Error) {
            const message = error.message.toLowerCase();
            // Errores que generalmente no mejoran con reintentos
            if (message.includes('authentication failed') ||
                message.includes('permission denied') ||
                message.includes('not found') ||
                message.includes('invalid parameter')) {
                return false;
            }
        }
        return true;
    }
}
exports.ExponentialBackoffStrategy = ExponentialBackoffStrategy;
