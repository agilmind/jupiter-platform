import {
  Scraper,
  TextProcessor,
  ContentExtractor,
  ScraperTask,
  ScraperResult,
  ScraperMethod,
  ScraperOptions,
  ScraperWorkerConfig,
} from '../scraper-interfaces';
import {Logger, TaskContext} from '@jupiter/worker-framework';

export class LightScraper implements Scraper {
  private textProcessor: TextProcessor;
  private contentExtractor: ContentExtractor;
  private config: ScraperWorkerConfig;
  private logger: Logger;
  private initialized: boolean = false;

  constructor(
    textProcessor: TextProcessor,
    contentExtractor: ContentExtractor,
    config: ScraperWorkerConfig,
    logger: Logger
  ) {
    this.textProcessor = textProcessor;
    this.contentExtractor = contentExtractor;
    this.config = config;
    this.logger = logger;
  }

  async initialize(): Promise<void> {
    this.initialized = true;
    this.logger.info('Light scraper initialized');
  }

  async cleanup(): Promise<void> {
    this.initialized = false;
    this.logger.info('Light scraper resources released');
  }

  canHandle(task: ScraperTask): boolean {
    if (!this.initialized) return false;

    // This scraper can handle tasks without browser requirements
    const options = this.getOptions(task);
    return !(
      options.formData ||     // Can't fill forms
      options.clicks ||       // Can't perform clicks
      options.screenshot ||   // Can't take screenshots
      options.waitFor         // Can't wait for dynamic elements
    );
  }

  async execute(task: ScraperTask, context: TaskContext): Promise<ScraperResult> {
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
      const requestOptions: RequestInit = {
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
      let keywordsFound: string[] = [];
      if (options.keywords && options.keywords.length > 0) {
        keywordsFound = options.keywords.filter(keyword =>
          text.toLowerCase().includes(keyword.toLowerCase())
        );

        if (keywordsFound.length > 0) {
          this.log(context, 'info', `Keywords found: ${keywordsFound.join(', ')}`);
        } else {
          this.log(context, 'info', 'No keywords found');
        }
      }

      // Log completion
      const endTime = Date.now();
      const executionTime = endTime - startTime;
      this.log(context, 'info', `Scraping completed in ${executionTime}ms (${text.length} characters extracted)`);

      // Create result
      const result: ScraperResult = {
        id: task.id,
        url: url,
        data: task.data,
        text: text.substring(0, 1000), // Short version of original text
        html: extractedHtml.substring(0, 5000), // Short version of original HTML
        processedText,
        stats: {
          originalLength: text.length,
          processedLength: processedText.length,
          wordCount: processedText.split(/\s+/).filter(Boolean).length,
          executionTimeMs: executionTime,
          method: ScraperMethod.LIGHT,
          keywordsFound: keywordsFound.length > 0 ? keywordsFound : undefined
        },
        timestamp: new Date().toISOString()
      };

      return result;
    } catch (error) {
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
          method: ScraperMethod.LIGHT
        },
        timestamp: new Date().toISOString()
      };
    }
  }

  // Helper methods
  private getUrl(task: ScraperTask): string {
    return task.url || task.data?.url || '';
  }

  private getSelector(task: ScraperTask): string {
    return task.selector || '';
  }

  private getOptions(task: ScraperTask): ScraperOptions {
    return task.data?.options || {};
  }

  private log(context: TaskContext, level: 'info' | 'warn' | 'error' | 'debug', message: string): void {
    context.logs.push({
      timestamp: new Date(),
      level,
      message
    });

    this.logger[level](message);
  }
}
