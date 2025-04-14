export interface VpsCreateGeneratorSchema {
  name: string;
  domains: string;
  directory?: string;
  tags?: string;
  forceOverwrite?: boolean;
}
