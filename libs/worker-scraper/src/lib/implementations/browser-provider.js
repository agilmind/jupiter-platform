"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlaywrightBrowserProvider = void 0;
const playwright_1 = require("playwright");
class PlaywrightBrowserProvider {
    constructor(config, logger) {
        this.config = config;
        this.logger = logger;
    }
    async initialize() {
        // Nada que inicializar a nivel global
        this.logger.info('Playwright provider initialized');
    }
    async cleanup() {
        // Nada que limpiar a nivel global
        this.logger.info('Playwright provider resources released');
    }
    async createBrowser(options) {
        const browserOptions = {
            headless: this.config.browser?.headless ?? true,
            timeout: this.config.browser?.timeout ?? 30000,
            args: this.config.browser?.args || ['--no-sandbox', '--disable-setuid-sandbox'],
            ...options
        };
        this.logger.debug('Creating browser instance', browserOptions);
        return playwright_1.chromium.launch(browserOptions);
    }
    async createPage(browser, options) {
        const contextOptions = {
            viewport: { width: 1366, height: 768 },
            ...options
        };
        const context = await browser.newContext(contextOptions);
        return await context.newPage();
    }
    async applyAntiDetection(page, settings) {
        if (!settings || !settings.enabled)
            return;
        // Ocultar WebDriver
        await page.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
        });
        // Simular plugins y fuentes
        if (settings.usePlugins) {
            await page.addInitScript(() => {
                // Simular plugins comunes del navegador
                Object.defineProperty(navigator, 'plugins', {
                    get: () => [
                        { name: 'Chrome PDF Plugin' },
                        { name: 'Chrome PDF Viewer' },
                        { name: 'Native Client' }
                    ]
                });
                // Simular mimetypes
                Object.defineProperty(navigator, 'mimeTypes', {
                    get: () => [
                        { type: 'application/pdf' },
                        { type: 'application/x-google-chrome-pdf' }
                    ]
                });
            });
        }
        // Aplicar técnicas específicas según la configuración
        if (settings.evasionTechniques && settings.evasionTechniques.length > 0) {
            for (const technique of settings.evasionTechniques) {
                switch (technique) {
                    case 'canvas-fingerprint':
                        await page.addInitScript(() => {
                            // Modificar canvas fingerprinting
                            const originalGetImageData = HTMLCanvasElement.prototype.toDataURL;
                            HTMLCanvasElement.prototype.toDataURL = function (type) {
                                // Añadir ruido sutil a canvas data
                                if (type === 'image/png' && this.width > 16 && this.height > 16) {
                                    const context = this.getContext('2d');
                                    if (context) {
                                        const imageData = context.getImageData(0, 0, 2, 2);
                                        imageData.data[0] = imageData.data[0] < 255 ? imageData.data[0] + 1 : imageData.data[0] - 1;
                                        context.putImageData(imageData, 0, 0);
                                    }
                                }
                                return originalGetImageData.apply(this, [type]);
                            };
                        });
                        break;
                    case 'timezone-mask':
                        await page.addInitScript(() => {
                            // Simular una zona horaria específica
                            const dateProto = Date.prototype;
                            const originalGetTimezoneOffset = dateProto.getTimezoneOffset;
                            dateProto.getTimezoneOffset = function () {
                                return -180; // Simular GMT+3
                            };
                        });
                        break;
                    case 'audio-fingerprint':
                        await page.addInitScript(() => {
                            // Modificar AudioContext fingerprinting
                            if (typeof window.AudioContext !== 'undefined') {
                                const originalCreateOscillator = AudioContext.prototype.createOscillator;
                                AudioContext.prototype.createOscillator = function () {
                                    const oscillator = originalCreateOscillator.apply(this, []);
                                    oscillator.frequency.value = (oscillator.frequency.value * 1.00001) % 22050;
                                    return oscillator;
                                };
                            }
                        });
                        break;
                }
            }
        }
        this.logger.debug('Anti-detection techniques applied', { techniques: settings.evasionTechniques });
    }
}
exports.PlaywrightBrowserProvider = PlaywrightBrowserProvider;
