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
    "rootDir": "./src",
    "typeRoots": ["./node_modules/@types", "./src/types"], // Añadir carpeta de tipos personalizados
    "resolveJsonModule": true,
    "moduleResolution": "node",
    "baseUrl": ".",
    "paths": {
      "*": ["node_modules/*", "src/types/*"]
    }
  },
  "include": ["src/**/*.ts", "src/types/**/*.d.ts"],
  "exclude": ["node_modules"]
}`;
}
