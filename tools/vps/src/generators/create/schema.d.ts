export interface VpsCreateGeneratorSchema {
  name: string;
  directory?: string;
  tags?: string;
  forceOverwrite?: boolean;
}

export interface NormalizedOptions extends VpsCreateGeneratorSchema {
  projectName: string;
  projectRoot: string;
  projectDirectory: string;
  vpsName: string;
  parsedTags: string[];
  vpsNameUpper: string;
}


