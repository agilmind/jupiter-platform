"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConsoleLogger = void 0;
class ConsoleLogger {
    constructor(prefix = 'worker') {
        this.prefix = prefix;
    }
    info(message, meta) {
        console.log(`[${this.prefix}] [INFO] ${message}`, meta || '');
    }
    warn(message, meta) {
        console.warn(`[${this.prefix}] [WARN] ${message}`, meta || '');
    }
    error(message, meta) {
        console.error(`[${this.prefix}] [ERROR] ${message}`, meta || '');
    }
    debug(message, meta) {
        console.debug(`[${this.prefix}] [DEBUG] ${message}`, meta || '');
    }
}
exports.ConsoleLogger = ConsoleLogger;
