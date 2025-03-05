#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

// Función para obtener nombre en diferentes formatos
function formatName(name) {
  const camelCase = name.replace(/-([a-z])/g, g => g[1].toUpperCase());
  const pascalCase = camelCase.charAt(0).toUpperCase() + camelCase.slice(1);
  const constantCase = name.replace(/-/g, '_').toUpperCase();
  return {
    fileName: name,
    camelCase,
    pascalCase,
    constantCase
  };
}

// Obtener argumentos
const args = process.argv.slice(2);
if (args.length < 1) {
  console.error('Usage: node create-worker.js <worker-name> [domain]');
  process.exit(1);
}

const workerName = args[0];
const domain = args[1] || 'scraper';

const names = formatName(workerName);
const workerDir = path.join('apps', workerName);

// Crear estructura de directorios
console.log(`Creating worker service: ${workerName} (domain: ${domain})`);
fs.mkdirSync(path.join(workerDir, 'src', 'app'), { recursive: true });

// Crear main.ts
const mainContent = `import { ${names.pascalCase}Worker, ${names.pascalCase}WorkerConfig } from './app/${names.fileName}.worker';
import { createLogger } from '@jupiter/worker-framework';

const logger = createLogger('${names.fileName}-service');

// Leer la configuración del entorno
const config: ${names.pascalCase}WorkerConfig = {
  queue: {
    host: process.env['RABBITMQ_HOST'] || 'localhost',
    port: parseInt(process.env['RABBITMQ_PORT'] || '5672', 10),
    user: process.env['RABBITMQ_USER'] || 'guest',
    password: process.env['RABBITMQ_PASSWORD'] || 'guest',
    mainQueue: process.env['${names.constantCase}_QUEUE'] || '${names.fileName}',
    retryQueue: process.env['${names.constantCase}_RETRY_QUEUE'] || '${names.fileName}-retry',
    deadLetterQueue: process.env['${names.constantCase}_DEAD_LETTER_QUEUE'] || '${names.fileName}-dlq',
    prefetch: parseInt(process.env['${names.constantCase}_PREFETCH'] || '5', 10)
  },
  retry: {
    maxRetries: parseInt(process.env['${names.constantCase}_MAX_RETRIES'] || '5', 10),
    initialDelayMs: parseInt(process.env['${names.constantCase}_INITIAL_RETRY_DELAY'] || '60000', 10),
    backoffFactor: parseFloat(process.env['${names.constantCase}_BACKOFF_FACTOR'] || '2'),
    maxDelayMs: parseInt(process.env['${names.constantCase}_MAX_RETRY_DELAY'] || '3600000', 10)
  },
  graphql: {
    endpoint: process.env['GRAPHQL_ENDPOINT'] || 'http://localhost:4000/graphql',
    apiKey: process.env['GRAPHQL_API_KEY'] || 'default-api-key'
  },
  ${domain}: {
    // Configuración específica para este worker
    // Ejemplo:
    timeout: parseInt(process.env['${names.constantCase}_TIMEOUT'] || '30000', 10),
    maxConcurrency: parseInt(process.env['${names.constantCase}_MAX_CONCURRENCY'] || '1', 10)
  }
};

// Iniciar el worker
const ${names.camelCase}Worker = new ${names.pascalCase}Worker(config);
${names.camelCase}Worker.start()
  .catch(error => {
    logger.error('Fatal error starting ${names.fileName} worker', { 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    process.exit(1);
  });
`;

// Crear worker.ts
const workerContent = `import { 
  BaseWorker, 
  WorkerTask, 
  TaskContext, 
  WorkerError, 
  WorkerConfig,
  createLogger
} from '@jupiter/worker-framework';

const logger = createLogger('${names.fileName}-worker');

// Interface para tareas específicas de este worker
export interface ${names.pascalCase}WorkerTask extends WorkerTask {
  // Define aquí los campos específicos para este tipo de tarea
  targetId?: string;
  data?: Record<string, any>;
  parameters?: Record<string, any>;
}

// Resultado de la ejecución de la tarea
export interface ${names.pascalCase}WorkerResult {
  // Define aquí los campos para el resultado de la tarea
  id: string;
  processedAt: string;
  status: string;
  data?: Record<string, any>;
}

// Configuración específica del worker
export interface ${names.pascalCase}WorkerConfig extends WorkerConfig {
  ${domain}: {
    // Configuración específica para este worker
    timeout: number;
    maxConcurrency: number;
  };
}

/**
 * Implementación de worker para ${domain}
 */
export class ${names.pascalCase}Worker extends BaseWorker<${names.pascalCase}WorkerTask, ${names.pascalCase}WorkerResult> {
  private ${domain}Config: ${names.pascalCase}WorkerConfig['${domain}'];
  
  constructor(config: ${names.pascalCase}WorkerConfig) {
    super(config);
    this.${domain}Config = config.${domain};
    
    logger.info('${names.pascalCase}Worker created', { 
      timeout: this.${domain}Config.timeout,
      maxConcurrency: this.${domain}Config.maxConcurrency
    });
  }
  
  /**
   * Devuelve el tipo de worker para logs
   */
  protected getWorkerType(): string {
    return '${domain}';
  }
  
  /**
   * Inicializa los recursos específicos del worker
   */
  protected async initialize(): Promise<void> {
    // Inicializar recursos específicos del worker
    // Ejemplo: conexión a bases de datos, servicios externos, etc.
    logger.info('${names.pascalCase}Worker initialized');
  }
  
  /**
   * Ejecuta la lógica específica de la tarea
   */
  protected async executeTask(task: ${names.pascalCase}WorkerTask, context: TaskContext): Promise<${names.pascalCase}WorkerResult> {
    this.log(context, 'info', \`Executing task \${task.id}\`, { type: task.type });
    
    try {
      // Implementar la lógica específica de la tarea
      // ...
      
      // Simulación - reemplaza con la lógica real
      this.log(context, 'info', 'Processing task...', { targetId: task.targetId });
      await new Promise(resolve => setTimeout(resolve, 1000));
      this.log(context, 'info', 'Task completed successfully');
      
      // Retornar resultado
      return {
        id: task.id,
        processedAt: new Date().toISOString(),
        status: 'completed',
        data: task.data
      };
    } catch (error) {
      this.log(context, 'error', \`Error executing task \${task.id}\`, { 
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Relanzar el error para que lo maneje el sistema de reintentos
      throw error;
    }
  }
  
  /**
   * Determina si un error es permanente
   */
  protected isPermanentError(error: any, task: ${names.pascalCase}WorkerTask): boolean {
    // Si es un WorkerError, usar su propiedad permanent
    if (error instanceof WorkerError) {
      return error.permanent;
    }
    
    // Implementar lógica específica para determinar errores permanentes
    // Ejemplo:
    const permanentErrorPatterns = [
      /not found/i,
      /invalid/i,
      /permission denied/i,
    ];
    
    const errorMessage = error.message || error.toString();
    return permanentErrorPatterns.some(pattern => pattern.test(errorMessage));
  }
  
  /**
   * Devuelve el paso inicial para la tarea
   */
  protected getInitialStep(task: ${names.pascalCase}WorkerTask): string {
    return \`Iniciando procesamiento de tarea \${task.type}\`;
  }
  
  /**
   * Cierra recursos y conexiones
   */
  protected async shutdown(): Promise<void> {
    try {
      // Cerrar recursos específicos
      logger.info('${names.pascalCase}Worker resources closed');
    } catch (error) {
      logger.error('Error closing ${names.pascalCase}Worker resources', { 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
    
    // Llamar al método de la clase base para cerrar otras conexiones
    await super.shutdown();
  }
}
`;

// Crear archivos principales
fs.writeFileSync(path.join(workerDir, 'src', 'main.ts'), mainContent);
fs.writeFileSync(path.join(workerDir, 'src', 'app', `${names.fileName}.worker.ts`), workerContent);

// Crear project.json
const projectJson = {
  "name": workerName,
  "$schema": "../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": `${workerDir}/src`,
  "projectType": "application",
  "targets": {
    "build": {
      "executor": "@nx/js:tsc",
      "outputs": ["{options.outputPath}"],
      "options": {
        "outputPath": `dist/${workerDir}`,
        "main": `${workerDir}/src/main.ts`,
        "tsConfig": `${workerDir}/tsconfig.app.json`,
        "assets": [`${workerDir}/src/assets`]
      },
      "configurations": {
        "production": {
          "optimization": true,
          "extractLicenses": true,
          "inspect": false
        }
      }
    },
    "serve": {
      "executor": "@nx/js:node",
      "options": {
        "buildTarget": `${workerName}:build`
      }
    },
    "lint": {
      "executor": "@nx/linter:eslint",
      "outputs": ["{options.outputFile}"],
      "options": {
        "lintFilePatterns": [`${workerDir}/**/*.ts`]
      }
    },
    "test": {
      "executor": "@nx/jest:jest",
      "outputs": [`coverage/${workerDir}`],
      "options": {
        "jestConfig": `${workerDir}/jest.config.ts`,
        "passWithNoTests": true
      }
    }
  },
  "tags": ["worker", "service", `domain:${domain}`]
};
fs.writeFileSync(path.join(workerDir, 'project.json'), JSON.stringify(projectJson, null, 2));

// Crear tsconfig.json
const tsconfigJson = {
  "extends": "../../tsconfig.base.json",
  "files": [],
  "include": [],
  "references": [
    {
      "path": "./tsconfig.app.json"
    },
    {
      "path": "./tsconfig.spec.json"
    }
  ]
};
fs.writeFileSync(path.join(workerDir, 'tsconfig.json'), JSON.stringify(tsconfigJson, null, 2));

// Crear tsconfig.app.json
const tsconfigAppJson = {
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "../../dist/out-tsc",
    "module": "commonjs",
    "types": ["node"]
  },
  "exclude": ["jest.config.ts", "**/*.spec.ts", "**/*.test.ts"],
  "include": ["**/*.ts"]
};
fs.writeFileSync(path.join(workerDir, 'tsconfig.app.json'), JSON.stringify(tsconfigAppJson, null, 2));

// Crear tsconfig.spec.json
const tsconfigSpecJson = {
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "../../dist/out-tsc",
    "module": "commonjs",
    "types": ["jest", "node"]
  },
  "include": [
    "jest.config.ts",
    "**/*.test.ts",
    "**/*.spec.ts",
    "**/*.d.ts"
  ]
};
fs.writeFileSync(path.join(workerDir, 'tsconfig.spec.json'), JSON.stringify(tsconfigSpecJson, null, 2));

// Crear Dockerfile
const dockerfileContent = `FROM node:18-alpine AS builder

WORKDIR /app

# Copiar package.json y archivos de dependencias
COPY package.json package-lock.json* ./
COPY nx.json tsconfig.base.json ./

# Instalar dependencias
RUN npm ci

# Copiar código fuente (solo lo necesario)
COPY libs/worker-framework libs/worker-framework
COPY ${workerDir} ${workerDir}

# Compilar la aplicación
RUN npx nx build ${workerName}

# Etapa de producción
FROM node:18-alpine

WORKDIR /app

# Copiar solo los archivos necesarios
COPY --from=builder /app/dist/${workerDir} ./
COPY --from=builder /app/package.json ./

# Instalar solo dependencias de producción
RUN npm ci --production && \\
    npm cache clean --force

# Variables de entorno
ENV NODE_ENV=production

# Usuario no-root para mejor seguridad
USER node

CMD ["node", "main.js"]`;
fs.writeFileSync(path.join(workerDir, 'Dockerfile'), dockerfileContent);

console.log(`✅ Worker service ${workerName} created successfully!`);
console.log('');
console.log('Next steps:');
console.log(`1. nx build ${workerName}`);
console.log(`2. Customize the worker logic in ${workerDir}/src/app/${names.fileName}.worker.ts`);
console.log(`3. nx serve ${workerName}`);
