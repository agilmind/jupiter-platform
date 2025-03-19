export interface CreateGeneratorSchema {
  projectName: string;
  includeApolloPrisma?: boolean;
  includeWebApp?: boolean;
  includeNativeApp?: boolean;
  includeScraperWorker?: boolean;
  includeReportWorker?: boolean;
  includeEmailWorker?: boolean;
  includePgBouncer?: boolean;
  includeRabbitMQ?: boolean;
}
