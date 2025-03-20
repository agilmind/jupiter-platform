import * as cheerio from 'cheerio';
import { ContentExtractor } from './scraper-interfaces';

export class CheerioContentExtractor implements ContentExtractor {
  extract(html: string, selector?: string): { text: string, extractedHtml: string } {
    const $ = cheerio.load(html);

    if (selector) {
      const elements = $(selector);
      if (elements.length === 0) {
        // Si no hay elementos con ese selector, usar todo el contenido
        return {
          text: $('body').text().trim(),
          extractedHtml: $('body').html() || ''
        };
      } else {
        return {
          text: elements.text().trim(),
          extractedHtml: elements.html() || ''
        };
      }
    } else {
      // Sin selector, extraer todo el texto
      return {
        text: $('body').text().trim(),
        extractedHtml: $('body').html() || ''
      };
    }
  }
}
