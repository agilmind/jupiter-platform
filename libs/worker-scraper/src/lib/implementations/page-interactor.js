"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlaywrightPageInteractor = void 0;
class PlaywrightPageInteractor {
    constructor(logger) {
        this.logger = logger;
    }
    async performClicks(page, clicks, context) {
        for (const click of clicks) {
            try {
                this.log(context, 'info', `Clicking on selector: ${click.selector}`);
                // Esperar a que el elemento sea visible
                await page.waitForSelector(click.selector, { state: 'visible' });
                // Hacer clic
                await page.click(click.selector);
                // Esperar después del clic si se especifica
                if (click.waitAfter) {
                    await page.waitForTimeout(click.waitAfter);
                }
            }
            catch (error) {
                this.log(context, 'warn', `Error clicking ${click.selector}: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    }
    async fillForms(page, formData, context) {
        for (const entry of formData) {
            try {
                this.log(context, 'info', `Filling field ${entry.selector}`);
                // Esperar a que el campo sea visible
                await page.waitForSelector(entry.selector, { state: 'visible' });
                // Manejar diferentes tipos de campos
                switch (entry.type) {
                    case 'checkbox':
                        if (entry.value.toLowerCase() === 'true') {
                            await page.check(entry.selector);
                        }
                        else {
                            await page.uncheck(entry.selector);
                        }
                        break;
                    case 'select':
                        await page.selectOption(entry.selector, entry.value);
                        break;
                    case 'radio':
                        await page.check(`${entry.selector}[value="${entry.value}"]`);
                        break;
                    case 'text':
                    default:
                        await page.fill(entry.selector, entry.value);
                        break;
                }
            }
            catch (error) {
                this.log(context, 'warn', `Error filling ${entry.selector}: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    }
    log(context, level, message) {
        context.logs.push({
            timestamp: new Date(),
            level,
            message
        });
        // También usar el logger
        this.logger[level](message);
    }
}
exports.PlaywrightPageInteractor = PlaywrightPageInteractor;
