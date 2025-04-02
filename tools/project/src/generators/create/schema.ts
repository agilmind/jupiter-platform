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
  appServerName?: string;
  webAppNames?: string[];
  nativeAppNames?: string[];
  workerNames?: string[];
  domainName?: string;
  sslOption?: string;
  webAppInternalPort?: string;
  appServerInternalPort?: string;
  nodeVersion?: string;
  appSourcePath?: string;
  appServerPort?: string;
  workerPort?: string;
  appServerProjectName?: string;
}
