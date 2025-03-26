"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DefaultTextProcessor = void 0;
class DefaultTextProcessor {
    processText(text, options) {
        let processed = text;
        // Eliminar etiquetas HTML si se solicita
        if (options?.removeHtml) {
            processed = processed.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        }
        // Limitar longitud si se especifica
        if (options?.maxLength && processed.length > options.maxLength) {
            processed = processed.substring(0, options.maxLength);
        }
        return processed;
    }
}
exports.DefaultTextProcessor = DefaultTextProcessor;
