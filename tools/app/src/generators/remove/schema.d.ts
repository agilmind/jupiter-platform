export interface AppRemoveGeneratorSchema {
  projectName: string;
  appName: string;
  force?: boolean;
  skipFormat?: boolean;
}
