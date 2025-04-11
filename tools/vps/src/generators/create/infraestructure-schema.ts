export interface CreateGeneratorSchema {
  projectName: string;
  appServerName: string;
  webAppNames: string[];
  nativeAppNames: string[];
  workerNames: string[];
}
