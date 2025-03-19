import { GeneratorOptions } from '../../../types';

export function playwrightUtilsTs(options: GeneratorOptions): string {
  return `import { Page } from 'playwright';

/**
 * Extrae texto de una página según un selector opcional
 */
export async function extractTextFromPage(page: Page, selector?: string): Promise<string> {
  try {
    if (selector) {
      // Si hay un selector, obtener el texto de ese elemento específico
      await page.waitForSelector(selector, { timeout: 5000 });
      const text = await page.$eval(selector, el => el.textContent || '');
      return text.trim();
    } else {
      // Si no hay selector, obtener el texto de todo el cuerpo
      const text = await page.$eval('body', el => el.textContent || '');
      return text.trim();
    }
  } catch (error) {
    console.error('Error extrayendo texto:', error);
    return \`Error extrayendo texto: \${error.message}\`;
  }
}`;
}
