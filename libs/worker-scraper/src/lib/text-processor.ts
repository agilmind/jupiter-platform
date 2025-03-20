import { TextProcessor, ScraperOptions } from './scraper-interfaces';

export class DefaultTextProcessor implements TextProcessor {
  processText(text: string, options?: ScraperOptions): string {
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
