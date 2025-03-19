export interface GeneratorOptions {
  projectName: string;
  projectRoot: string;
  includeApolloPrisma: boolean;
  includeWebApp: boolean;
  includeNativeApp: boolean;
  includeScraperWorker: boolean;
  includeReportWorker: boolean;
  includeEmailWorker: boolean;
  includePgBouncer: boolean;
  includeRabbitMQ: boolean;
}
