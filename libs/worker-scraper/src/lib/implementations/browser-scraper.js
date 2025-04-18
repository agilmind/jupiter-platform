"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BrowserScraper = void 0;
const scraper_interfaces_1 = require("../scraper-interfaces");
class BrowserScraper {
    constructor(browserProvider, textProcessor, pageInteractor, proxyManager, config, logger) {
        this.concurrentPages = 0;
        this.initialized = false;
        this.browserProvider = browserProvider;
        this.textProcessor = textProcessor;
        this.pageInteractor = pageInteractor;
        this.proxyManager = proxyManager;
        this.config = config;
        this.logger = logger;
    }
    async initialize() {
        await this.browserProvider.initialize();
        this.initialized = true;
        this.logger.info('Browser scraper initialized');
    }
    async cleanup() {
        await this.browserProvider.cleanup();
        this.initialized = false;
        this.logger.info('Browser scraper resources released');
    }
    canHandle(task) {
        return this.initialized;
    }
    async execute(task, context) {
        if (!this.initialized) {
            throw new Error('BrowserScraper not properly initialized');
        }
        const url = this.getUrl(task);
        if (!url) {
            throw new Error('URL not provided for scraping');
        }
        const selector = this.getSelector(task);
        const options = this.getOptions(task);
        // Log start
        this.log(context, 'info', `Starting browser scraping for URL: ${url}`);
        // Control concurrency
        const maxConcurrency = this.config.scraper?.maxConcurrentBrowsers || 3;
        if (this.concurrentPages >= maxConcurrency) {
            this.log(context, 'warn', `Waiting to not exceed concurrency limit (${maxConcurrency})`);
            await new Promise(resolve => setTimeout(resolve, 500 * this.concurrentPages));
        }
        this.concurrentPages++;
        const startTime = Date.now();
        let browser = null;
        let page = null;
        let screenshot;
        try {
            // Get proxy if configured
            const proxy = this.proxyManager.getProxy(options);
            if (proxy) {
                this.proxyManager.logProxyUse(proxy, context);
            }
            // Browser setup
            const browserOptions = proxy ? { proxy } : undefined;
            browser = await this.browserProvider.createBrowser(browserOptions);
            // Context setup
            const contextOptions = {
                viewport: { width: 1366, height: 768 },
                userAgent: options.userAgent ||
                    (options.antiDetection?.customUserAgent) ||
                    this.config.scraper?.userAgent
            };
            page = await this.browserProvider.createPage(browser, contextOptions);
            // Configure timeouts
            page.setDefaultTimeout(options.timeout || 30000);
            // Apply anti-detection if enabled
            if (options.antiDetection?.enabled) {
                await this.browserProvider.applyAntiDetection(page, options.antiDetection);
            }
            // Block image requests if specified
            if (!options.loadImages) {
                await page.route('**/*.{png,jpg,jpeg,gif,webp,svg}', route => route.abort());
            }
            // Navigate to URL
            this.log(context, 'info', `Navigating to ${url}`);
            await page.goto(url, { waitUntil: 'domcontentloaded' });
            // Wait for selector if requested
            if (options.waitFor) {
                this.log(context, 'info', `Waiting for selector to appear: ${options.waitFor}`);
                await page.waitForSelector(options.waitFor, { timeout: options.timeout || 30000 })
                    .catch(() => {
                    this.log(context, 'warn', `Timeout waiting for selector: ${options.waitFor}`);
                });
            }
            // Perform clicks if specified
            if (options.clicks && options.clicks.length > 0) {
                await this.pageInteractor.performClicks(page, options.clicks, context);
            }
            // Fill forms if specified
            if (options.formData && options.formData.length > 0) {
                await this.pageInteractor.fillForms(page, options.formData, context);
            }
            // Extract content
            let text;
            let html;
            if (selector) {
                // Try to extract content from selector
                await page.waitForSelector(selector, { timeout: 5000 }).catch(() => {
                    this.log(context, 'warn', `Selector ${selector} not found, using full content`);
                });
                const elements = await page.$$(selector);
                if (elements.length > 0) {
                    const texts = await Promise.all(elements.map(element => element.textContent()));
                    text = texts.filter(Boolean).join('\n');
                    html = await page.content();
                }
                else {
                    // If no elements, extract all text
                    text = await page.innerText('body');
                    html = await page.content();
                }
            }
            else {
                // No selector, extract all text
                text = await page.innerText('body');
                html = await page.content();
            }
            // Take screenshot if requested
            if (options.screenshot) {
                this.log(context, 'info', 'Taking screenshot');
                const buffer = await page.screenshot({ type: 'jpeg', quality: 80 });
                screenshot = buffer.toString('base64');
            }
            // Process text
            const processedText = this.textProcessor.processText(text, options);
            // Log completion
            const endTime = Date.now();
            const executionTime = endTime - startTime;
            this.log(context, 'info', `Scraping completed in ${executionTime}ms (${text.length} characters extracted)`);
            // Create result
            const result = {
                id: task.id,
                url: url,
                data: task.data,
                text: text.substring(0, 1000),
                html: html.substring(0, 5000),
                processedText,
                stats: {
                    originalLength: text.length,
                    processedLength: processedText.length,
                    wordCount: processedText.split(/\s+/).filter(Boolean).length,
                    executionTimeMs: executionTime,
                    method: scraper_interfaces_1.ScraperMethod.BROWSER,
                    proxyUsed: proxy ? 'yes' : 'no',
                    antiDetectionUsed: options.antiDetection?.enabled ? 'yes' : 'no'
                },
                timestamp: new Date().toISOString(),
                screenshot: screenshot
            };
            return result;
        }
        catch (error) {
            // Log error
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.log(context, 'error', `Error in browser scraping: ${errorMessage}`);
            // Try to take error screenshot if page is open
            if (page && options.screenshot) {
                try {
                    const buffer = await page.screenshot({ type: 'jpeg', quality: 70 });
                    screenshot = buffer.toString('base64');
                }
                catch (screenshotError) {
                    this.log(context, 'warn', 'Could not take error screenshot');
                }
            }
            // Create error result
            const endTime = Date.now();
            const executionTime = endTime - startTime;
            return {
                id: task.id,
                url: url,
                data: task.data,
                text: `Error: ${errorMessage}`,
                error: errorMessage,
                stats: {
                    executionTimeMs: executionTime,
                    method: scraper_interfaces_1.ScraperMethod.BROWSER,
                    proxyUsed: options.proxy ? 'yes' : 'no',
                    antiDetectionUsed: options.antiDetection?.enabled ? 'yes' : 'no'
                },
                timestamp: new Date().toISOString(),
                screenshot: screenshot
            };
        }
        finally {
            // Close page and browser
            if (page) {
                await page.close().catch(() => { });
            }
            if (browser) {
                await browser.close().catch(() => { });
            }
            this.concurrentPages--;
        }
    }
    // Helper methods
    getUrl(task) {
        return task.url || task.data?.url || '';
    }
    getSelector(task) {
        return task.selector || '';
    }
    getOptions(task) {
        return task.data?.options || {};
    }
    log(context, level, message) {
        context.logs.push({
            timestamp: new Date(),
            level,
            message
        });
        this.logger[level](message);
    }
}
exports.BrowserScraper = BrowserScraper;
