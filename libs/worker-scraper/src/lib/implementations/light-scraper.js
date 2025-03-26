"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LightScraper = void 0;
const scraper_interfaces_1 = require("../scraper-interfaces");
class LightScraper {
    constructor(textProcessor, contentExtractor, config, logger) {
        this.initialized = false;
        this.textProcessor = textProcessor;
        this.contentExtractor = contentExtractor;
        this.config = config;
        this.logger = logger;
    }
    async initialize() {
        this.initialized = true;
        this.logger.info('Light scraper initialized');
    }
    async cleanup() {
        this.initialized = false;
        this.logger.info('Light scraper resources released');
    }
    canHandle(task) {
        if (!this.initialized)
            return false;
        // This scraper can handle tasks without browser requirements
        const options = this.getOptions(task);
        return !(options.formData || // Can't fill forms
            options.clicks || // Can't perform clicks
            options.screenshot || // Can't take screenshots
            options.waitFor // Can't wait for dynamic elements
        );
    }
    async execute(task, context) {
        if (!this.initialized) {
            throw new Error('LightScraper not initialized');
        }
        const url = this.getUrl(task);
        if (!url) {
            throw new Error('URL not provided for scraping');
        }
        const selector = this.getSelector(task);
        const options = this.getOptions(task);
        // Log start
        this.log(context, 'info', `Starting light scraping for URL: ${url}`);
        const startTime = Date.now();
        try {
            // Configure request options
            const requestOptions = {
                headers: {
                    'user-agent': options.userAgent || this.config.scraper?.userAgent ||
                        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                },
                signal: AbortSignal.timeout(options.timeout || 30000)
            };
            // Make HTTP request
            this.log(context, 'info', `Making GET request to ${url}`);
            const response = await fetch(url, requestOptions);
            if (!response.ok) {
                throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
            }
            const html = await response.text();
            if (!html) {
                throw new Error('Empty response from server');
            }
            // Extract content
            const { text, extractedHtml } = this.contentExtractor.extract(html, selector);
            // Process text
            const processedText = this.textProcessor.processText(text, options);
            // Find keywords if specified
            let keywordsFound = [];
            if (options.keywords && options.keywords.length > 0) {
                keywordsFound = options.keywords.filter(keyword => text.toLowerCase().includes(keyword.toLowerCase()));
                if (keywordsFound.length > 0) {
                    this.log(context, 'info', `Keywords found: ${keywordsFound.join(', ')}`);
                }
                else {
                    this.log(context, 'info', 'No keywords found');
                }
            }
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
                html: extractedHtml.substring(0, 5000),
                processedText,
                stats: {
                    originalLength: text.length,
                    processedLength: processedText.length,
                    wordCount: processedText.split(/\s+/).filter(Boolean).length,
                    executionTimeMs: executionTime,
                    method: scraper_interfaces_1.ScraperMethod.LIGHT,
                    keywordsFound: keywordsFound.length > 0 ? keywordsFound : undefined
                },
                timestamp: new Date().toISOString()
            };
            return result;
        }
        catch (error) {
            // Log error
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.log(context, 'error', `Error in light scraping: ${errorMessage}`);
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
                    method: scraper_interfaces_1.ScraperMethod.LIGHT
                },
                timestamp: new Date().toISOString()
            };
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
exports.LightScraper = LightScraper;
