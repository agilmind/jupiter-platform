export interface AppCreateGeneratorSchema {
  projectName: string;
  appName: string;
  appType: 'static'; // Por ahora solo 'static'
  domain: string;
  directory?: string;
  tags?: string;
}
