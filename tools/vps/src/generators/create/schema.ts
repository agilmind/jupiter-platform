export interface CreateGeneratorSchema {
  projectName: string;
  domainName?: string;
  sslOption?: string;
  webAppInternalPort?: string;
  appServerInternalPort?: string;
  nodeVersion?: string;
  appServerPort?: string;
  workerPort?: string;
  letsencryptEmail?: string;
}
