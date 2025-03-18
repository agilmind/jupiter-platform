import { GeneratorOptions } from '../types';

export function tsConfig(options: GeneratorOptions): string {
  return `{
  "extends": "../../../tsconfig.base.json",
  "files": [],
  "include": [],
  "references": [
    {
      "path": "./tsconfig.app.json"
    }
  ]
}`;
}
