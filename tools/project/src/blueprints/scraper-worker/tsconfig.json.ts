import { GeneratorOptions } from '../types';

export function tsConfig(options: GeneratorOptions): string {
  return `{
  "compilerOptions": {
    "target": "es2020",
    "module": "commonjs",
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "strict": false,              // Temporalmente menos estricto para desarrollo
    "noImplicitAny": false,       // Permitir 'any' implícito
    "strictNullChecks": false,    // Desactivar chequeo de nulos
    "skipLibCheck": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules"]
}`;
}
