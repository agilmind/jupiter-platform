import { RunGeneratorSchema } from '../run/schema';

export interface TranscribeGeneratorSchema {
  name: string;
  haikuDir: string;
  dryRun?: boolean;
  runOptions?: RunGeneratorSchema
}

