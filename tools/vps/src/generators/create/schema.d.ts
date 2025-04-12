export interface VpsCreateGeneratorSchema {
  name: string;
  directory?: string;
  tags?: string;
  forceOverwrite?: boolean;
}
