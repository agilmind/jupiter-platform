import { Page } from 'playwright';

/**
 * Extrae texto de una página según un selector opcional
 */
export async function extractTextFromPage(
  page: Page,
  selector?: string
): Promise<string> {
  try {
    // Primero esperamos a que la página termine de cargar
    await page.waitForLoadState('domcontentloaded', { timeout: 10000 });

    // Pequeña pausa para asegurar que el contenido dinámico se cargue
    await page.waitForTimeout(1000);

    if (selector) {
      try {
        // Si hay un selector, obtener el texto de ese elemento específico
        // Aumentamos el timeout a 7 segundos
        await page.waitForSelector(selector, { timeout: 7000 });
        const text = await page.$eval(selector, (el) => el.textContent || '');
        return text.trim();
      } catch (selectorError: any) {
        // Si el selector falla, lo registramos y continuamos con el body
        console.warn(
          `No se pudo encontrar el selector "${selector}": ${selectorError.message}`
        );
        console.warn('Fallback: extrayendo texto del body completo');
      }
    }

    // Si no hay selector o falló, obtener el texto de todo el cuerpo
    const text = await page.$eval('body', (el) => el.textContent || '');
    return text.trim();
  } catch (error: any) {
    console.error('Error extrayendo texto:', error);
    return `Error extrayendo texto: ${error.message}`;
  }
}
