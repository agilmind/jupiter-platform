import { RunGeneratorSchema } from '../run/schema';

export interface TranscribeGeneratorSchema {
  name: string;
  dryRun?: boolean;
  runOptions: RunGeneratorSchema
}

