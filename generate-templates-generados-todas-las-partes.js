const fs = require('fs');
const path = require('path');

// Directorio base donde se encuentran los templates
const baseDir = 'tools/project/src/blueprints/infrastructure';

// Contenido de los templates - Parte 1 (Configuración del monorepo y proyecto)
const templateContentsBase = {
  // A nivel del monorepo
  'nx.json.template': `{
  "npmScope": "__projectName__",
  "affected": {
    "defaultBase": "main"
  },
  "tasksRunnerOptions": {
    "default": {
      "runner": "nx/tasks-runners/default",
      "options": {
        "cacheableOperations": ["build", "lint", "test", "e2e"]
      }
    }
  },
  "targetDefaults": {
    "build": {
      "dependsOn": ["^build"],
      "inputs": ["production", "^production"]
    },
    "test": {
      "inputs": ["default", "^production", "{workspaceRoot}/jest.preset.js"]
    },
    "lint": {
      "inputs": ["default", "{workspaceRoot}/.eslintrc.json"]
    }
  },
  "namedInputs": {
    "default": ["{projectRoot}/**/*", "sharedGlobals"],
    "production": [
      "default",
      "!{projectRoot}/**/?(*.)+(spec|test).[jt]s?(x)?(.snap)",
      "!{projectRoot}/tsconfig.spec.json",
      "!{projectRoot}/jest.config.[jt]s",
      "!{projectRoot}/.eslintrc.json"
    ],
    "sharedGlobals": []
  }
}`,

  'package.json.template': `{
  "name": "__projectName__-monorepo",
  "version": "0.0.0",
  "license": "MIT",
  "scripts": {
    "start": "nx serve",
    "build": "nx build",
    "test": "nx test",
    "lint": "nx workspace-lint && nx lint",
    "e2e": "nx e2e",
    "affected:apps": "nx affected:apps",
    "affected:libs": "nx affected:libs",
    "affected:build": "nx affected:build",
    "affected:e2e": "nx affected:e2e",
    "affected:test": "nx affected:test",
    "affected:lint": "nx affected:lint",
    "affected:dep-graph": "nx affected:dep-graph",
    "affected": "nx affected",
    "format": "nx format:write",
    "format:write": "nx format:write",
    "format:check": "nx format:check",
    "update": "nx migrate latest",
    "workspace-generator": "nx workspace-generator",
    "dep-graph": "nx dep-graph",
    "help": "nx help"
  },
  "private": true,
  "devDependencies": {
    "@nrwl/cli": "^17.0.0",
    "@nrwl/eslint-plugin-nx": "^17.0.0",
    "@nrwl/jest": "^17.0.0",
    "@nrwl/linter": "^17.0.0",
    "@nrwl/nx-cloud": "^17.0.0",
    "@nrwl/react": "^17.0.0",
    "@nrwl/web": "^17.0.0",
    "@nrwl/workspace": "^17.0.0",
    "@types/jest": "^29.5.0",
    "@types/node": "^22.0.0",
    "@typescript-eslint/eslint-plugin": "^7.0.0",
    "@typescript-eslint/parser": "^7.0.0",
    "eslint": "^8.50.0",
    "eslint-config-prettier": "^9.0.0",
    "jest": "^29.7.0",
    "prettier": "^3.0.0",
    "ts-jest": "^29.1.0",
    "typescript": "^5.7.2",
    "nx": "^17.0.0"
  },
  "workspaces": [
    "apps/*",
    "libs/*"
  ],
  "engines": {
    "node": ">=20.0.0"
  }
}`,

  'tsconfig.base.json.template': `{
  "compileOnSave": false,
  "compilerOptions": {
    "rootDir": ".",
    "sourceMap": true,
    "declaration": false,
    "moduleResolution": "node",
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "importHelpers": true,
    "target": "es2022",
    "module": "esnext",
    "lib": ["es2022", "dom"],
    "skipLibCheck": true,
    "skipDefaultLibCheck": true,
    "baseUrl": ".",
    "paths": {
      "@__projectName__/shared": ["libs/__projectName__/shared/src/index.ts"],
      "@__projectName__/api-interfaces": ["libs/__projectName__/api-interfaces/src/index.ts"]
    }
  },
  "exclude": ["node_modules", "tmp"]
}`,

  'jest.config.js.template': `const { getJestProjects } = require('@nrwl/jest');

module.exports = {
  projects: getJestProjects(),
};`,

  '.eslintrc.json.template': `{
  "root": true,
  "ignorePatterns": ["**/*"],
  "plugins": ["@nrwl/nx"],
  "overrides": [
    {
      "files": ["*.ts", "*.tsx", "*.js", "*.jsx"],
      "rules": {
        "@nrwl/nx/enforce-module-boundaries": [
          "error",
          {
            "enforceBuildableLibDependency": true,
            "allow": [],
            "depConstraints": [
              {
                "sourceTag": "*",
                "onlyDependOnLibsWithTags": ["*"]
              }
            ]
          }
        ]
      }
    },
    {
      "files": ["*.ts", "*.tsx"],
      "extends": ["plugin:@nrwl/nx/typescript"],
      "rules": {}
    },
    {
      "files": ["*.js", "*.jsx"],
      "extends": ["plugin:@nrwl/nx/javascript"],
      "rules": {}
    }
  ]
}`,

  '.prettierrc.template': `{
  "singleQuote": true,
  "semi": true,
  "tabWidth": 2,
  "printWidth": 100,
  "trailingComma": "es5"
}`,

  // Nivel de proyecto
  'apps/__projectName__/project.json.template': `{
  "name": "__projectName__",
  "root": "apps/__projectName__",
  "projectType": "application",
  "tags": ["scope:__projectName__"]
}`,

  'apps/__projectName__/tsconfig.json.template': `{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "allowJs": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "types": ["node", "jest"]
  },
  "files": [],
  "include": [],
  "references": [
    {
      "path": "./__appServerName__/tsconfig.json"
    }
  ]
}`,

  'apps/__projectName__/.env.example.template': `# Ejemplo de variables de entorno comunes para el proyecto __projectName__
NODE_ENV=development
LOG_LEVEL=debug

# Database
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=__projectName__
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/__projectName__

# RabbitMQ
RABBITMQ_DEFAULT_USER=guest
RABBITMQ_DEFAULT_PASS=guest
RABBITMQ_HOST=rabbitmq
RABBITMQ_PORT=5672
RABBITMQ_URL=amqp://guest:guest@rabbitmq:5672

# Server
SERVER_PORT=4000
API_URL=http://localhost:4000
`
};

// Función para escribir el contenido en los archivos template
function writeTemplateContent(templatesObj) {
  console.log('Iniciando la escritura de contenido en templates...');

  for (const [filePath, content] of Object.entries(templatesObj)) {
    const fullPath = path.join(baseDir, filePath);

    if (fs.existsSync(fullPath)) {
      fs.writeFileSync(fullPath, content, 'utf8');
      console.log(`Contenido escrito en: ${fullPath}`);
    } else {
      console.error(`El archivo ${fullPath} no existe.`);
    }
  }

  console.log('¡Escritura de contenido completada para este conjunto de templates!');
}

// Exportamos la función para poder usarla en scripts separados
module.exports = { writeTemplateContent };

// Si este script se ejecuta directamente
if (require.main === module) {
  writeTemplateContent(templateContentsBase);
}

// Cargamos el módulo del script anterior si es necesario
try {
  const part1 = require('./template-content-part1');
} catch (e) {
  // Si no se puede cargar, continuamos sin problemas
}



// Contenido de los templates - Parte 2 (Docker Compose)
const templateContentsDockerCompose = {
  'apps/__projectName__/docker-compose.dev.yml.template': `version: '3.8'

services:
  __appServerName__:
    build:
      context: ../../
      dockerfile: apps/__projectName__/__appServerName__/Dockerfile
      args:
        NODE_ENV: development
    environment:
      - NODE_ENV=development
      - PORT=\${SERVER_PORT}
      - DATABASE_URL=\${DATABASE_URL}
      - RABBITMQ_URL=\${RABBITMQ_URL}
    ports:
      - "\${SERVER_PORT}:\${SERVER_PORT}"
    volumes:
      - ../../apps/__projectName__/__appServerName__:/app/apps/__projectName__/__appServerName__
      - ../../libs:/app/libs
      - node_modules:/app/node_modules
    depends_on:
      - postgres
      - rabbitmq
    command: sh -c "npx prisma migrate dev && nx serve __appServerName__ --watch"

  postgres:
    image: postgres:14
    environment:
      - POSTGRES_USER=\${POSTGRES_USER}
      - POSTGRES_PASSWORD=\${POSTGRES_PASSWORD}
      - POSTGRES_DB=\${POSTGRES_DB}
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5

  rabbitmq:
    image: rabbitmq:3-management
    environment:
      - RABBITMQ_DEFAULT_USER=\${RABBITMQ_DEFAULT_USER}
      - RABBITMQ_DEFAULT_PASS=\${RABBITMQ_DEFAULT_PASS}
    ports:
      - "5672:5672"
      - "15672:15672"
    volumes:
      - rabbitmq_data:/var/lib/rabbitmq
    healthcheck:
      test: ["CMD", "rabbitmq-diagnostics", "-q", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
  rabbitmq_data:
  node_modules:
  worker_node_modules:
`,

  'apps/__projectName__/docker-compose.prod.yml.template': `version: '3.8'

services:
  __appServerName__:
    build:
      context: ../../
      dockerfile: apps/__projectName__/__appServerName__/Dockerfile
      args:
        NODE_ENV: production
    environment:
      - NODE_ENV=production
      - PORT=\${SERVER_PORT}
      - DATABASE_URL=\${DATABASE_URL}
      - RABBITMQ_URL=\${RABBITMQ_URL}
    ports:
      - "\${SERVER_PORT}:\${SERVER_PORT}"
    restart: always
    depends_on:
      - postgres
      - rabbitmq
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 500M

  postgres:
    image: postgres:14
    environment:
      - POSTGRES_USER=\${POSTGRES_USER}
      - POSTGRES_PASSWORD=\${POSTGRES_PASSWORD}
      - POSTGRES_DB=\${POSTGRES_DB}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: always
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 30s
      timeout: 5s
      retries: 3

  rabbitmq:
    image: rabbitmq:3-management
    environment:
      - RABBITMQ_DEFAULT_USER=\${RABBITMQ_DEFAULT_USER}
      - RABBITMQ_DEFAULT_PASS=\${RABBITMQ_DEFAULT_PASS}
    volumes:
      - rabbitmq_data:/var/lib/rabbitmq
    restart: always
    healthcheck:
      test: ["CMD", "rabbitmq-diagnostics", "-q", "ping"]
      interval: 30s
      timeout: 5s
      retries: 3

volumes:
  postgres_data:
  rabbitmq_data:
`,

  'apps/__projectName__/docker-compose.stage.yml.template': `version: '3.8'

services:
  __appServerName__:
    build:
      context: ../../
      dockerfile: apps/__projectName__/__appServerName__/Dockerfile
      args:
        NODE_ENV: staging
    environment:
      - NODE_ENV=staging
      - PORT=\${SERVER_PORT}
      - DATABASE_URL=\${DATABASE_URL}
      - RABBITMQ_URL=\${RABBITMQ_URL}
    ports:
      - "\${SERVER_PORT}:\${SERVER_PORT}"
    restart: always
    depends_on:
      - postgres
      - rabbitmq

  postgres:
    image: postgres:14
    environment:
      - POSTGRES_USER=\${POSTGRES_USER}
      - POSTGRES_PASSWORD=\${POSTGRES_PASSWORD}
      - POSTGRES_DB=\${POSTGRES_DB}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: always

  rabbitmq:
    image: rabbitmq:3-management
    environment:
      - RABBITMQ_DEFAULT_USER=\${RABBITMQ_DEFAULT_USER}
      - RABBITMQ_DEFAULT_PASS=\${RABBITMQ_DEFAULT_PASS}
    volumes:
      - rabbitmq_data:/var/lib/rabbitmq
    restart: always

volumes:
  postgres_data:
  rabbitmq_data:
`
};

// Función para escribir el contenido en los archivos template
function writeTemplateContent(templatesObj) {
  console.log('Iniciando la escritura de contenido en templates (Parte 2)...');

  for (const [filePath, content] of Object.entries(templatesObj)) {
    const fullPath = path.join(baseDir, filePath);

    if (fs.existsSync(fullPath)) {
      fs.writeFileSync(fullPath, content, 'utf8');
      console.log(`Contenido escrito en: ${fullPath}`);
    } else {
      console.error(`El archivo ${fullPath} no existe.`);
    }
  }

  console.log('¡Escritura de contenido completada para este conjunto de templates!');
}

// Exportamos la función para poder usarla en scripts separados
module.exports = { writeTemplateContent };

// Si este script se ejecuta directamente
if (require.main === module) {
  writeTemplateContent(templateContentsDockerCompose);
}



// Contenido de los templates - Parte 3a (App Server)
const templateContentsAppServer = {
  // App Server
  'apps/__projectName__/__appServerName__/project.json.template': `{
  "name": "__appServerName__",
  "root": "apps/__projectName__/__appServerName__",
  "sourceRoot": "apps/__projectName__/__appServerName__/src",
  "projectType": "application",
  "targets": {
    "build": {
      "executor": "@nrwl/node:webpack",
      "outputs": ["{options.outputPath}"],
      "options": {
        "outputPath": "dist/apps/__projectName__/__appServerName__",
        "main": "apps/__projectName__/__appServerName__/src/main.ts",
        "tsConfig": "apps/__projectName__/__appServerName__/tsconfig.app.json",
        "assets": ["apps/__projectName__/__appServerName__/src/assets"]
      },
      "configurations": {
        "production": {
          "optimization": true,
          "extractLicenses": true,
          "inspect": false,
          "fileReplacements": [
            {
              "replace": "apps/__projectName__/__appServerName__/src/environments/environment.ts",
              "with": "apps/__projectName__/__appServerName__/src/environments/environment.prod.ts"
            }
          ]
        }
      }
    },
    "serve": {
      "executor": "@nrwl/node:node",
      "options": {
        "buildTarget": "__appServerName__:build"
      }
    },
    "lint": {
      "executor": "@nrwl/linter:eslint",
      "options": {
        "lintFilePatterns": ["apps/__projectName__/__appServerName__/**/*.ts"]
      }
    },
    "test": {
      "executor": "@nrwl/jest:jest",
      "outputs": ["coverage/apps/__projectName__/__appServerName__"],
      "options": {
        "jestConfig": "apps/__projectName__/__appServerName__/jest.config.js",
        "passWithNoTests": true
      }
    }
  },
  "tags": ["type:app", "scope:__projectName__"]
}`,

  'apps/__projectName__/__appServerName__/package.json.template': `{
  "name": "@__projectName__/__appServerName__",
  "version": "0.0.1",
  "dependencies": {
    "@apollo/server": "^4.11.3",
    "express": "^4.18.2",
    "graphql": "^16.8.1",
    "@prisma/client": "^6.5.0",
    "amqplib": "^0.10.3",
    "dotenv": "^16.3.1",
    "winston": "^3.11.0",
    "cors": "^2.8.5",
    "helmet": "^7.1.0"
  },
  "devDependencies": {
    "prisma": "^6.5.0",
    "@types/express": "^4.17.21",
    "@types/amqplib": "^0.10.4",
    "@types/cors": "^2.8.17"
  }
}`,

  'apps/__projectName__/__appServerName__/tsconfig.json.template': `{
  "extends": "../tsconfig.json",
  "compilerOptions": {
    "module": "commonjs",
    "target": "es2022",
    "outDir": "../../../dist/apps/__projectName__/__appServerName__",
    "types": ["node", "jest"]
  },
  "exclude": ["node_modules", "tmp", "**/*.spec.ts"],
  "include": ["**/*.ts"]
}`,

  'apps/__projectName__/__appServerName__/tsconfig.app.json.template': `{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "../../../dist/out-tsc",
    "types": ["node"]
  },
  "exclude": ["**/*.spec.ts", "**/*.test.ts"],
  "include": ["**/*.ts"]
}`
};

// Función para escribir el contenido en los archivos template
function writeTemplateContent(templatesObj) {
  console.log('Iniciando la escritura de contenido en templates (Parte 3a)...');

  for (const [filePath, content] of Object.entries(templatesObj)) {
    const fullPath = path.join(baseDir, filePath);

    if (fs.existsSync(fullPath)) {
      fs.writeFileSync(fullPath, content, 'utf8');
      console.log(`Contenido escrito en: ${fullPath}`);
    } else {
      console.error(`El archivo ${fullPath} no existe.`);
    }
  }

  console.log('¡Escritura de contenido completada para este conjunto de templates!');
}

// Si este script se ejecuta directamente
if (require.main === module) {
  writeTemplateContent(templateContentsAppServer);
}



// Contenido de los templates - Parte 3b (App Server continuación)
const templateContentsAppServerCont = {
  'apps/__projectName__/__appServerName__/.env.example.template': `# Server Configuration
NODE_ENV=development
SERVER_PORT=4000
LOG_LEVEL=debug

# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/__projectName__

# RabbitMQ
RABBITMQ_URL=amqp://guest:guest@localhost:5672

# JWT
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=1d

# CORS
CORS_ORIGIN=http://localhost:3000,http://localhost:8081
`,

  'apps/__projectName__/__appServerName__/jest.config.js.template': `module.exports = {
  displayName: '__appServerName__',
  preset: '../../../jest.preset.js',
  globals: {
    'ts-jest': {
      tsconfig: '<rootDir>/tsconfig.spec.json',
    },
  },
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': 'ts-jest',
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../../coverage/apps/__projectName__/__appServerName__',
};`,

  'apps/__projectName__/__appServerName__/Dockerfile.template': `# Base stage
FROM node:22-alpine AS base
WORKDIR /app
ENV NODE_ENV=production

# Dependencies stage
FROM base AS dependencies
COPY package.json package-lock.json ./
COPY apps/__projectName__/__appServerName__/package.json ./apps/__projectName__/__appServerName__/
COPY libs/__projectName__/shared/package.json ./libs/__projectName__/shared/
COPY libs/__projectName__/api-interfaces/package.json ./libs/__projectName__/api-interfaces/
RUN npm ci --production=false

# Build stage
FROM dependencies AS build
COPY . .
RUN npx nx build __appServerName__ --prod

# Runtime stage
FROM base AS runtime
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=build /app/dist/apps/__projectName__/__appServerName__ ./
COPY apps/__projectName__/__appServerName__/prisma ./prisma

# Install only production dependencies
RUN npm ci --only=production

# Generate Prisma client
RUN npx prisma generate

# Expose the server port
EXPOSE 4000

# Start the server
CMD ["node", "main.js"]`,

  'apps/__projectName__/__appServerName__/.dockerignore.template': `node_modules
npm-debug.log
dist
tmp
.nx
.git
`,

  'apps/__projectName__/__appServerName__/prisma/schema.prisma.template': `// This is your Prisma schema file
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// Add your models here
model User {
  id        String   @id @default(uuid())
  email     String   @unique
  name      String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
`
};

// Función para escribir el contenido en los archivos template
function writeTemplateContent(templatesObj) {
  console.log('Iniciando la escritura de contenido en templates (Parte 3b)...');

  for (const [filePath, content] of Object.entries(templatesObj)) {
    const fullPath = path.join(baseDir, filePath);

    if (fs.existsSync(fullPath)) {
      fs.writeFileSync(fullPath, content, 'utf8');
      console.log(`Contenido escrito en: ${fullPath}`);
    } else {
      console.error(`El archivo ${fullPath} no existe.`);
    }
  }

  console.log('¡Escritura de contenido completada para este conjunto de templates!');
}

// Si este script se ejecuta directamente
if (require.main === module) {
  writeTemplateContent(templateContentsAppServerCont);
}



// Contenido de los templates - Parte 4a (Web App)
const templateContentsWebApp1 = {
  // Web App
  'apps/__projectName__/__webAppName__/project.json.template': `{
  "name": "__webAppName__",
  "root": "apps/__projectName__/__webAppName__",
  "sourceRoot": "apps/__projectName__/__webAppName__/src",
  "projectType": "application",
  "targets": {
    "build": {
      "executor": "@nrwl/vite:build",
      "outputs": ["{options.outputPath}"],
      "defaultConfiguration": "production",
      "options": {
        "outputPath": "dist/apps/__projectName__/__webAppName__"
      },
      "configurations": {
        "development": {
          "mode": "development"
        },
        "production": {
          "mode": "production"
        }
      }
    },
    "serve": {
      "executor": "@nrwl/vite:dev-server",
      "defaultConfiguration": "development",
      "options": {
        "buildTarget": "__webAppName__:build"
      },
      "configurations": {
        "development": {
          "buildTarget": "__webAppName__:build:development",
          "hmr": true
        },
        "production": {
          "buildTarget": "__webAppName__:build:production",
          "hmr": false
        }
      }
    },
    "lint": {
      "executor": "@nrwl/linter:eslint",
      "outputs": ["{options.outputFile}"],
      "options": {
        "lintFilePatterns": ["apps/__projectName__/__webAppName__/**/*.{ts,tsx,js,jsx}"]
      }
    },
    "test": {
      "executor": "@nrwl/vite:test",
      "outputs": ["coverage/apps/__projectName__/__webAppName__"],
      "options": {
        "passWithNoTests": true
      }
    }
  },
  "tags": ["type:app", "scope:__projectName__"]
}`
};

const templateContentsWebApp2 = {
  'apps/__projectName__/__webAppName__/package.json.template': `{
  "name": "@__projectName__/__webAppName__",
  "version": "0.0.1",
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.3.0",
    "@apollo/client": "^3.8.8",
    "graphql": "^16.8.1",
    "zustand": "^4.4.7",
    "axios": "^1.6.5"
  },
  "devDependencies": {
    "@types/react": "^18.2.42",
    "@types/react-dom": "^18.2.17",
    "@vitejs/plugin-react": "^4.2.1",
    "sass": "^1.69.5",
    "vite": "^5.0.12"
  }
}`
};

// Función para escribir el contenido en los archivos template
function writeTemplateContent(templatesObj) {
  console.log('Iniciando la escritura de contenido en templates (Parte 4)...');

  for (const [filePath, content] of Object.entries(templatesObj)) {
    const fullPath = path.join(baseDir, filePath);

    if (fs.existsSync(fullPath)) {
      fs.writeFileSync(fullPath, content, 'utf8');
      console.log(`Contenido escrito en: ${fullPath}`);
    } else {
      console.error(`El archivo ${fullPath} no existe.`);
    }
  }

  console.log('¡Escritura de contenido completada para este conjunto de templates!');
}

// Si este script se ejecuta directamente
if (require.main === module) {
  writeTemplateContent(templateContentsWebApp1);
  writeTemplateContent(templateContentsWebApp2);
}



// Contenido de los templates - Parte 4b (Web App continuación)
const templateContentsWebApp3 = {
  'apps/__projectName__/__webAppName__/tsconfig.json.template': `{
  "extends": "../tsconfig.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "allowJs": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "forceConsistentCasingInFileNames": true,
    "strict": true,
    "noImplicitOverride": true,
    "noPropertyAccessFromIndexSignature": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  },
  "files": [],
  "include": [],
  "references": [
    {
      "path": "./tsconfig.app.json"
    }
  ]
}`
};

const templateContentsWebApp4 = {
  'apps/__projectName__/__webAppName__/tsconfig.app.json.template': `{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "../../../dist/out-tsc",
    "types": ["node", "vite/client"]
  },
  "files": [
    "../../../node_modules/@nrwl/react/typings/cssmodule.d.ts",
    "../../../node_modules/@nrwl/react/typings/image.d.ts"
  ],
  "exclude": ["**/*.spec.ts", "**/*.test.ts", "**/*.stories.ts", "**/*.spec.tsx", "**/*.test.tsx", "**/*.stories.tsx"],
  "include": ["**/*.js", "**/*.jsx", "**/*.ts", "**/*.tsx"]
}`
};

const templateContentsWebApp5 = {
  'apps/__projectName__/__webAppName__/vite.config.ts.template': `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 3000,
    open: true,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\\/api/, ''),
      },
      '/graphql': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});`
};

// Función para escribir el contenido en los archivos template
function writeTemplateContent(templatesObj) {
  console.log('Iniciando la escritura de contenido en templates (Parte 4b)...');

  for (const [filePath, content] of Object.entries(templatesObj)) {
    const fullPath = path.join(baseDir, filePath);

    if (fs.existsSync(fullPath)) {
      fs.writeFileSync(fullPath, content, 'utf8');
      console.log(`Contenido escrito en: ${fullPath}`);
    } else {
      console.error(`El archivo ${fullPath} no existe.`);
    }
  }

  console.log('¡Escritura de contenido completada para este conjunto de templates!');
}

// Si este script se ejecuta directamente
if (require.main === module) {
  writeTemplateContent(templateContentsWebApp3);
  writeTemplateContent(templateContentsWebApp4);
  writeTemplateContent(templateContentsWebApp5);
}



// Contenido de los templates - Parte 4c (Web App continuación)
const templateContentsWebApp6 = {
  'apps/__projectName__/__webAppName__/index.html.template': `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>__projectName__ | __webAppName__</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`,

  'apps/__projectName__/__webAppName__/.env.example.template': `# API Configuration
VITE_API_URL=http://localhost:4000
VITE_GRAPHQL_URL=http://localhost:4000/graphql

# App Configuration
VITE_APP_NAME=__webAppName__
VITE_APP_VERSION=0.0.1
`
};

const templateContentsWebApp7 = {
  'apps/__projectName__/__webAppName__/jest.config.js.template': `module.exports = {
  displayName: '__webAppName__',
  preset: '../../../jest.preset.js',
  transform: {
    '^(?!.*\\\\.(js|jsx|ts|tsx|css|json)$)': '@nrwl/react/plugins/jest',
    '^.+\\\\.[tj]sx?$': ['babel-jest', { presets: ['@nrwl/react/babel'] }],
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  coverageDirectory: '../../../coverage/apps/__projectName__/__webAppName__',
};`,

  'apps/__projectName__/__webAppName__/Dockerfile.template': `# Base stage
FROM node:22-alpine AS base
WORKDIR /app
ENV NODE_ENV=production

# Dependencies stage
FROM base AS dependencies
COPY package.json package-lock.json ./
COPY apps/__projectName__/__webAppName__/package.json ./apps/__projectName__/__webAppName__/
COPY libs/__projectName__/shared/package.json ./libs/__projectName__/shared/
COPY libs/__projectName__/api-interfaces/package.json ./libs/__projectName__/api-interfaces/
RUN npm ci --production=false

# Build stage
FROM dependencies AS build
COPY . .
RUN npx nx build __webAppName__ --prod

# Runtime stage (using nginx)
FROM nginx:alpine AS runtime
COPY --from=build /app/dist/apps/__projectName__/__webAppName__ /usr/share/nginx/html
COPY apps/__projectName__/__webAppName__/nginx.conf /etc/nginx/conf.d/default.conf

# Expose the web port
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]`
};

const templateContentsWebApp8 = {
  'apps/__projectName__/__webAppName__/.dockerignore.template': `node_modules
npm-debug.log
dist
tmp
.nx
.git
`,

  'apps/__projectName__/__webAppName__/nginx.conf.template': `server {
    listen 80;
    server_name localhost;
    root /usr/share/nginx/html;
    index index.html;

    # Compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

    # Static files
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN";
    add_header X-XSS-Protection "1; mode=block";
    add_header X-Content-Type-Options "nosniff";
    add_header Referrer-Policy "strict-origin-when-cross-origin";
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' http://localhost:4000";
}
`
};

// Función para escribir el contenido en los archivos template
function writeTemplateContent(templatesObj) {
  console.log('Iniciando la escritura de contenido en templates (Parte 4c)...');

  for (const [filePath, content] of Object.entries(templatesObj)) {
    const fullPath = path.join(baseDir, filePath);

    if (fs.existsSync(fullPath)) {
      fs.writeFileSync(fullPath, content, 'utf8');
      console.log(`Contenido escrito en: ${fullPath}`);
    } else {
      console.error(`El archivo ${fullPath} no existe.`);
    }
  }

  console.log('¡Escritura de contenido completada para este conjunto de templates!');
}

// Si este script se ejecuta directamente
if (require.main === module) {
  writeTemplateContent(templateContentsWebApp6);
  writeTemplateContent(templateContentsWebApp7);
  writeTemplateContent(templateContentsWebApp8);
}



// Contenido de los templates - Parte 5a (Native App)
const templateContentsNativeApp1 = {
  // Native App
  'apps/__projectName__/__nativeAppName__/project.json.template': `{
  "name": "__nativeAppName__",
  "root": "apps/__projectName__/__nativeAppName__",
  "sourceRoot": "apps/__projectName__/__nativeAppName__/src",
  "projectType": "application",
  "targets": {
    "start": {
      "executor": "@nrwl/react-native:start",
      "options": {
        "port": 8081
      }
    },
    "serve": {
      "executor": "nx:run-commands",
      "options": {
        "command": "nx start __nativeAppName__"
      }
    },
    "run-ios": {
      "executor": "@nrwl/react-native:run-ios",
      "options": {}
    },
    "bundle-ios": {
      "executor": "@nrwl/react-native:bundle",
      "outputs": ["apps/__projectName__/__nativeAppName__/build"],
      "options": {
        "entryFile": "src/main.tsx",
        "platform": "ios",
        "bundleOutput": "dist/apps/__projectName__/__nativeAppName__/ios/main.jsbundle"
      }
    },
    "run-android": {
      "executor": "@nrwl/react-native:run-android",
      "options": {}
    },
    "build-android": {
      "executor": "@nrwl/react-native:build-android",
      "outputs": [
        "apps/__projectName__/__nativeAppName__/android/app/build/outputs/bundle",
        "apps/__projectName__/__nativeAppName__/android/app/build/outputs/apk"
      ],
      "options": {}
    },
    "bundle-android": {
      "executor": "@nrwl/react-native:bundle",
      "options": {
        "entryFile": "src/main.tsx",
        "platform": "android",
        "bundleOutput": "dist/apps/__projectName__/__nativeAppName__/android/main.jsbundle"
      }
    },
    "lint": {
      "executor": "@nrwl/linter:eslint",
      "outputs": ["{options.outputFile}"],
      "options": {
        "lintFilePatterns": ["apps/__projectName__/__nativeAppName__/**/*.{ts,tsx,js,jsx}"]
      }
    },
    "test": {
      "executor": "@nrwl/jest:jest",
      "outputs": ["coverage/apps/__projectName__/__nativeAppName__"],
      "options": {
        "jestConfig": "apps/__projectName__/__nativeAppName__/jest.config.js",
        "passWithNoTests": true
      }
    }
  },
  "tags": ["type:app", "scope:__projectName__", "platform:mobile"]
}`
};

// Función para escribir el contenido en los archivos template
function writeTemplateContent(templatesObj) {
  console.log('Iniciando la escritura de contenido en templates (Parte 5a)...');

  for (const [filePath, content] of Object.entries(templatesObj)) {
    const fullPath = path.join(baseDir, filePath);

    if (fs.existsSync(fullPath)) {
      fs.writeFileSync(fullPath, content, 'utf8');
      console.log(`Contenido escrito en: ${fullPath}`);
    } else {
      console.error(`El archivo ${fullPath} no existe.`);
    }
  }

  console.log('¡Escritura de contenido completada para este conjunto de templates!');
}

// Si este script se ejecuta directamente
if (require.main === module) {
  writeTemplateContent(templateContentsNativeApp1);
}


// Contenido de los templates - Parte 5b (Native App continuación)
const templateContentsNativeApp2 = {
  'apps/__projectName__/__nativeAppName__/package.json.template': `{
  "name": "@__projectName__/__nativeAppName__",
  "version": "0.0.1",
  "dependencies": {
    "react": "^18.3.1",
    "react-native": "^0.78.1",
    "@react-navigation/native": "^6.1.10",
    "@react-navigation/stack": "^6.3.21",
    "react-native-safe-area-context": "^4.9.0",
    "react-native-screens": "^3.29.0",
    "@apollo/client": "^3.8.8",
    "graphql": "^16.8.1",
    "react-native-mmkv-storage": "^0.9.1",
    "zustand": "^4.4.7",
    "axios": "^1.6.5"
  },
  "devDependencies": {
    "@types/react": "^18.2.42",
    "@types/react-native": "^0.73.0",
    "babel-jest": "^29.7.0",
    "metro-react-native-babel-preset": "^0.77.0",
    "react-native-codegen": "^0.100.0"
  }
}`
};

const templateContentsNativeApp3 = {
  'apps/__projectName__/__nativeAppName__/tsconfig.json.template': `{
  "extends": "../tsconfig.json",
  "compilerOptions": {
    "jsx": "react-native",
    "allowJs": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "strict": true,
    "types": ["react-native", "jest", "node"]
  },
  "files": [],
  "include": [],
  "references": [
    {
      "path": "./tsconfig.app.json"
    }
  ]
}`,

  'apps/__projectName__/__nativeAppName__/metro.config.js.template': `/**
 * Metro configuration
 * https://facebook.github.io/metro/docs/configuration
 *
 * @type {import('metro-config').MetroConfig}
 */
const { getMetroConfig } = require('@nrwl/react-native');
const { resolve, join } = require('path');

module.exports = (async () => {
  const config = await getMetroConfig();
  const monorepoRoot = resolve(__dirname, '../../..');
  const projectRoot = __dirname;

  return {
    ...config,
    projectRoot,
    watchFolders: [monorepoRoot],
    resolver: {
      ...config.resolver,
      extraNodeModules: {
        '@__projectName__/api-interfaces': join(monorepoRoot, 'libs/__projectName__/api-interfaces'),
        '@__projectName__/shared': join(monorepoRoot, 'libs/__projectName__/shared')
      },
    },
    transformer: {
      ...config.transformer,
      getTransformOptions: async () => ({
        transform: {
          experimentalImportSupport: false,
          inlineRequires: true,
        },
      }),
    },
  };
})();`
};

// Función para escribir el contenido en los archivos template
function writeTemplateContent(templatesObj) {
  console.log('Iniciando la escritura de contenido en templates (Parte 5b)...');

  for (const [filePath, content] of Object.entries(templatesObj)) {
    const fullPath = path.join(baseDir, filePath);

    if (fs.existsSync(fullPath)) {
      fs.writeFileSync(fullPath, content, 'utf8');
      console.log(`Contenido escrito en: ${fullPath}`);
    } else {
      console.error(`El archivo ${fullPath} no existe.`);
    }
  }

  console.log('¡Escritura de contenido completada para este conjunto de templates!');
}

// Si este script se ejecuta directamente
if (require.main === module) {
  writeTemplateContent(templateContentsNativeApp2);
  writeTemplateContent(templateContentsNativeApp3);
}


// Contenido de los templates - Parte 5c (Native App continuación)
const templateContentsNativeApp4 = {
  'apps/__projectName__/__nativeAppName__/app.json.template': `{
  "name": "__nativeAppName__",
  "displayName": "__projectName__ __nativeAppName__"
}`,

  'apps/__projectName__/__nativeAppName__/.env.example.template': `# API Configuration
API_URL=http://localhost:4000
GRAPHQL_URL=http://localhost:4000/graphql

# App Configuration
APP_NAME=__nativeAppName__
APP_VERSION=0.0.1

# For iOS & Android emulators, use the special IP address that points to the host machine
# For iOS: API_URL=http://localhost:4000
# For Android: API_URL=http://10.0.2.2:4000
`
};

const templateContentsNativeApp5 = {
  'apps/__projectName__/__nativeAppName__/jest.config.js.template': `module.exports = {
  displayName: '__nativeAppName__',
  preset: 'react-native',
  resolver: '@nrwl/jest/plugins/resolver',
  moduleFileExtensions: ['ts', 'js', 'html', 'tsx', 'jsx'],
  setupFilesAfterEnv: ['<rootDir>/test-setup.ts'],
  moduleNameMapper: {
    '.svg': '@nrwl/react-native/plugins/jest/svg-mock'
  },
  transform: {
    '^.+\\.(js|ts|tsx)$': [
      'babel-jest',
      {
        cwd: __dirname,
        configFile: './babel.config.json'
      }
    ],
    '^.+\\.(bmp|gif|jpg|jpeg|mp4|png|psd|svg|webp)$': require.resolve(
      'react-native/jest/assetFileTransformer.js'
    )
  }
};`
};

const templateContentsNativeApp6 = {
  'apps/__projectName__/__nativeAppName__/Dockerfile.template': `# Base stage for React Native build
FROM node:22-alpine AS build
WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
COPY apps/__projectName__/__nativeAppName__/package.json ./apps/__projectName__/__nativeAppName__/
COPY libs/__projectName__/shared/package.json ./libs/__projectName__/shared/
COPY libs/__projectName__/api-interfaces/package.json ./libs/__projectName__/api-interfaces/
RUN npm ci --production=false

# Copy source code
COPY . .

# Build for Android
RUN npx nx build-android __nativeAppName__ --prod

# Output: /app/apps/__projectName__/__nativeAppName__/android/app/build/outputs/apk/release/app-release.apk

# This Dockerfile is mainly for CI/CD purposes
# For actual device deployment, you'll need platform-specific workflows
# and might need more specialized Docker images with Android SDK or iOS tools`
};

const templateContentsNativeApp7 = {
  'apps/__projectName__/__nativeAppName__/.dockerignore.template': `node_modules
npm-debug.log
dist
tmp
.nx
.git
android/app/build
ios/build
`
};

// Función para escribir el contenido en los archivos template
function writeTemplateContent(templatesObj) {
  console.log('Iniciando la escritura de contenido en templates (Parte 5c)...');

  for (const [filePath, content] of Object.entries(templatesObj)) {
    const fullPath = path.join(baseDir, filePath);

    if (fs.existsSync(fullPath)) {
      fs.writeFileSync(fullPath, content, 'utf8');
      console.log(`Contenido escrito en: ${fullPath}`);
    } else {
      console.error(`El archivo ${fullPath} no existe.`);
    }
  }

  console.log('¡Escritura de contenido completada para este conjunto de templates!');
}

// Si este script se ejecuta directamente
if (require.main === module) {
  writeTemplateContent(templateContentsNativeApp4);
  writeTemplateContent(templateContentsNativeApp5);
  writeTemplateContent(templateContentsNativeApp6);
  writeTemplateContent(templateContentsNativeApp7);
}



// Contenido de los templates - Parte 6a (Worker)
const templateContentsWorker1 = {
  // Worker
  'apps/__projectName__/__workerName__/project.json.template': `{
  "name": "__workerName__",
  "root": "apps/__projectName__/__workerName__",
  "sourceRoot": "apps/__projectName__/__workerName__/src",
  "projectType": "application",
  "targets": {
    "build": {
      "executor": "@nrwl/node:webpack",
      "outputs": ["{options.outputPath}"],
      "options": {
        "outputPath": "dist/apps/__projectName__/__workerName__",
        "main": "apps/__projectName__/__workerName__/src/main.ts",
        "tsConfig": "apps/__projectName__/__workerName__/tsconfig.app.json",
        "assets": ["apps/__projectName__/__workerName__/src/assets"]
      },
      "configurations": {
        "production": {
          "optimization": true,
          "extractLicenses": true,
          "inspect": false,
          "fileReplacements": [
            {
              "replace": "apps/__projectName__/__workerName__/src/environments/environment.ts",
              "with": "apps/__projectName__/__workerName__/src/environments/environment.prod.ts"
            }
          ]
        }
      }
    },
    "serve": {
      "executor": "@nrwl/node:node",
      "options": {
        "buildTarget": "__workerName__:build"
      }
    },
    "lint": {
      "executor": "@nrwl/linter:eslint",
      "options": {
        "lintFilePatterns": ["apps/__projectName__/__workerName__/**/*.ts"]
      }
    },
    "test": {
      "executor": "@nrwl/jest:jest",
      "outputs": ["coverage/apps/__projectName__/__workerName__"],
      "options": {
        "jestConfig": "apps/__projectName__/__workerName__/jest.config.js",
        "passWithNoTests": true
      }
    }
  },
  "tags": ["type:worker", "scope:__projectName__"]
}`
};

// Función para escribir el contenido en los archivos template
function writeTemplateContent(templatesObj) {
  console.log('Iniciando la escritura de contenido en templates (Parte 6a)...');

  for (const [filePath, content] of Object.entries(templatesObj)) {
    const fullPath = path.join(baseDir, filePath);

    if (fs.existsSync(fullPath)) {
      fs.writeFileSync(fullPath, content, 'utf8');
      console.log(`Contenido escrito en: ${fullPath}`);
    } else {
      console.error(`El archivo ${fullPath} no existe.`);
    }
  }

  console.log('¡Escritura de contenido completada para este conjunto de templates!');
}

// Si este script se ejecuta directamente
if (require.main === module) {
  writeTemplateContent(templateContentsWorker1);
}



// Contenido de los templates - Parte 6b (Worker continuación)
const templateContentsWorker2 = {
  'apps/__projectName__/__workerName__/package.json.template': `{
  "name": "@__projectName__/__workerName__",
  "version": "0.0.1",
  "dependencies": {
    "amqplib": "^0.10.3",
    "@prisma/client": "^6.5.0",
    "dotenv": "^16.3.1",
    "winston": "^3.11.0"
  },
  "devDependencies": {
    "@types/amqplib": "^0.10.4",
    "prisma": "^6.5.0"
  }
}`,

  'apps/__projectName__/__workerName__/tsconfig.json.template': `{
  "extends": "../tsconfig.json",
  "compilerOptions": {
    "module": "commonjs",
    "target": "es2022",
    "outDir": "../../../dist/apps/__projectName__/__workerName__",
    "types": ["node", "jest"]
  },
  "exclude": ["node_modules", "tmp", "**/*.spec.ts"],
  "include": ["**/*.ts"]
}`
};

const templateContentsWorker3 = {
  'apps/__projectName__/__workerName__/tsconfig.app.json.template': `{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "../../../dist/out-tsc",
    "types": ["node"]
  },
  "exclude": ["**/*.spec.ts", "**/*.test.ts"],
  "include": ["**/*.ts"]
}`,

  'apps/__projectName__/__workerName__/.env.example.template': `# Worker Configuration
NODE_ENV=development
LOG_LEVEL=debug

# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/__projectName__

# RabbitMQ
RABBITMQ_URL=amqp://guest:guest@localhost:5672
RABBITMQ_QUEUE=__workerName__-queue
RABBITMQ_EXCHANGE=__projectName__-exchange
RABBITMQ_ROUTING_KEY=__workerName__-key
`
};

// Función para escribir el contenido en los archivos template
function writeTemplateContent(templatesObj) {
  console.log('Iniciando la escritura de contenido en templates (Parte 6b)...');

  for (const [filePath, content] of Object.entries(templatesObj)) {
    const fullPath = path.join(baseDir, filePath);

    if (fs.existsSync(fullPath)) {
      fs.writeFileSync(fullPath, content, 'utf8');
      console.log(`Contenido escrito en: ${fullPath}`);
    } else {
      console.error(`El archivo ${fullPath} no existe.`);
    }
  }

  console.log('¡Escritura de contenido completada para este conjunto de templates!');
}

// Si este script se ejecuta directamente
if (require.main === module) {
  writeTemplateContent(templateContentsWorker2);
  writeTemplateContent(templateContentsWorker3);
}


// Contenido de los templates - Parte 6c (Worker continuación)
const templateContentsWorker4 = {
  'apps/__projectName__/__workerName__/jest.config.js.template': `module.exports = {
  displayName: '__workerName__',
  preset: '../../../jest.preset.js',
  globals: {
    'ts-jest': {
      tsconfig: '<rootDir>/tsconfig.spec.json',
    },
  },
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': 'ts-jest',
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../../coverage/apps/__projectName__/__workerName__',
};`,

  'apps/__projectName__/__workerName__/Dockerfile.template': `# Base stage
FROM node:22-alpine AS base
WORKDIR /app
ENV NODE_ENV=production

# Dependencies stage
FROM base AS dependencies
COPY package.json package-lock.json ./
COPY apps/__projectName__/__workerName__/package.json ./apps/__projectName__/__workerName__/
COPY libs/__projectName__/shared/package.json ./libs/__projectName__/shared/
COPY libs/__projectName__/api-interfaces/package.json ./libs/__projectName__/api-interfaces/
RUN npm ci --production=false

# Build stage
FROM dependencies AS build
COPY . .
RUN npx nx build __workerName__ --prod

# Runtime stage
FROM base AS runtime
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=build /app/dist/apps/__projectName__/__workerName__ ./
COPY apps/__projectName__/__workerName__/prisma ./prisma

# Install only production dependencies
RUN npm ci --only=production

# Generate Prisma client if needed
RUN npx prisma generate

# Start the worker
CMD ["node", "main.js"]`
};

const templateContentsWorker5 = {
  'apps/__projectName__/__workerName__/.dockerignore.template': `node_modules
npm-debug.log
dist
tmp
.nx
.git
`
};

// Función para escribir el contenido en los archivos template
function writeTemplateContent(templatesObj) {
  console.log('Iniciando la escritura de contenido en templates (Parte 6c)...');

  for (const [filePath, content] of Object.entries(templatesObj)) {
    const fullPath = path.join(baseDir, filePath);

    if (fs.existsSync(fullPath)) {
      fs.writeFileSync(fullPath, content, 'utf8');
      console.log(`Contenido escrito en: ${fullPath}`);
    } else {
      console.error(`El archivo ${fullPath} no existe.`);
    }
  }

  console.log('¡Escritura de contenido completada para este conjunto de templates!');
}

// Si este script se ejecuta directamente
if (require.main === module) {
  writeTemplateContent(templateContentsWorker4);
  writeTemplateContent(templateContentsWorker5);
}



// Contenido de los templates - Parte 7a (Shared Libs)
const templateContentsShared1 = {
  // Libs Shared
  'libs/__projectName__/shared/project.json.template': `{
  "name": "shared",
  "root": "libs/__projectName__/shared",
  "sourceRoot": "libs/__projectName__/shared/src",
  "projectType": "library",
  "targets": {
    "build": {
      "executor": "@nrwl/js:tsc",
      "outputs": ["{options.outputPath}"],
      "options": {
        "outputPath": "dist/libs/__projectName__/shared",
        "tsConfig": "libs/__projectName__/shared/tsconfig.lib.json",
        "packageJson": "libs/__projectName__/shared/package.json",
        "main": "libs/__projectName__/shared/src/index.ts",
        "assets": ["libs/__projectName__/shared/*.md"]
      }
    },
    "lint": {
      "executor": "@nrwl/linter:eslint",
      "outputs": ["{options.outputFile}"],
      "options": {
        "lintFilePatterns": ["libs/__projectName__/shared/**/*.ts"]
      }
    },
    "test": {
      "executor": "@nrwl/jest:jest",
      "outputs": ["coverage/libs/__projectName__/shared"],
      "options": {
        "jestConfig": "libs/__projectName__/shared/jest.config.js",
        "passWithNoTests": true
      }
    }
  },
  "tags": ["type:lib", "scope:shared"]
}`
};

const templateContentsShared2 = {
  'libs/__projectName__/shared/package.json.template': `{
  "name": "@__projectName__/shared",
  "version": "0.0.1",
  "type": "commonjs"
}`
};

// Función para escribir el contenido en los archivos template
function writeTemplateContent(templatesObj) {
  console.log('Iniciando la escritura de contenido en templates (Parte 7a)...');

  for (const [filePath, content] of Object.entries(templatesObj)) {
    const fullPath = path.join(baseDir, filePath);

    if (fs.existsSync(fullPath)) {
      fs.writeFileSync(fullPath, content, 'utf8');
      console.log(`Contenido escrito en: ${fullPath}`);
    } else {
      console.error(`El archivo ${fullPath} no existe.`);
    }
  }

  console.log('¡Escritura de contenido completada para este conjunto de templates!');
}

// Si este script se ejecuta directamente
if (require.main === module) {
  writeTemplateContent(templateContentsShared1);
  writeTemplateContent(templateContentsShared2);
}



// Contenido de los templates - Parte 7b (Shared Libs continuación)
const templateContentsShared3 = {
  'libs/__projectName__/shared/tsconfig.json.template': `{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "module": "commonjs",
    "forceConsistentCasingInFileNames": true,
    "strict": true,
    "noImplicitOverride": true,
    "noPropertyAccessFromIndexSignature": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  },
  "files": [],
  "include": [],
  "references": [
    {
      "path": "./tsconfig.lib.json"
    },
    {
      "path": "./tsconfig.spec.json"
    }
  ]
}`
};

const templateContentsShared4 = {
  'libs/__projectName__/shared/tsconfig.lib.json.template': `{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "../../../dist/out-tsc",
    "declaration": true,
    "types": ["node"]
  },
  "include": ["**/*.ts"],
  "exclude": ["jest.config.ts", "**/*.spec.ts", "**/*.test.ts"]
}`
};

const templateContentsShared5 = {
  'libs/__projectName__/shared/jest.config.js.template': `module.exports = {
  displayName: 'shared',
  preset: '../../../jest.preset.js',
  globals: {
    'ts-jest': {
      tsconfig: '<rootDir>/tsconfig.spec.json',
    },
  },
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': 'ts-jest',
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../../coverage/libs/__projectName__/shared',
};`
};

// Función para escribir el contenido en los archivos template
function writeTemplateContent(templatesObj) {
  console.log('Iniciando la escritura de contenido en templates (Parte 7b)...');

  for (const [filePath, content] of Object.entries(templatesObj)) {
    const fullPath = path.join(baseDir, filePath);

    if (fs.existsSync(fullPath)) {
      fs.writeFileSync(fullPath, content, 'utf8');
      console.log(`Contenido escrito en: ${fullPath}`);
    } else {
      console.error(`El archivo ${fullPath} no existe.`);
    }
  }

  console.log('¡Escritura de contenido completada para este conjunto de templates!');
}

// Si este script se ejecuta directamente
if (require.main === module) {
  writeTemplateContent(templateContentsShared3);
  writeTemplateContent(templateContentsShared4);
  writeTemplateContent(templateContentsShared5);
}



// Contenido de los templates - Parte 8 (API Interfaces)
const templateContentsApi1 = {
  // Libs API Interfaces
  'libs/__projectName__/api-interfaces/project.json.template': `{
  "name": "api-interfaces",
  "root": "libs/__projectName__/api-interfaces",
  "sourceRoot": "libs/__projectName__/api-interfaces/src",
  "projectType": "library",
  "targets": {
    "build": {
      "executor": "@nrwl/js:tsc",
      "outputs": ["{options.outputPath}"],
      "options": {
        "outputPath": "dist/libs/__projectName__/api-interfaces",
        "tsConfig": "libs/__projectName__/api-interfaces/tsconfig.lib.json",
        "packageJson": "libs/__projectName__/api-interfaces/package.json",
        "main": "libs/__projectName__/api-interfaces/src/index.ts",
        "assets": ["libs/__projectName__/api-interfaces/*.md"]
      }
    },
    "lint": {
      "executor": "@nrwl/linter:eslint",
      "outputs": ["{options.outputFile}"],
      "options": {
        "lintFilePatterns": ["libs/__projectName__/api-interfaces/**/*.ts"]
      }
    }
  },
  "tags": ["type:lib", "scope:api"]
}`
};

const templateContentsApi2 = {
  'libs/__projectName__/api-interfaces/package.json.template': `{
  "name": "@__projectName__/api-interfaces",
  "version": "0.0.1",
  "type": "commonjs"
}`,

  'libs/__projectName__/api-interfaces/tsconfig.json.template': `{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "module": "commonjs",
    "forceConsistentCasingInFileNames": true,
    "strict": true,
    "noImplicitOverride": true,
    "noPropertyAccessFromIndexSignature": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  },
  "files": [],
  "include": [],
  "references": [
    {
      "path": "./tsconfig.lib.json"
    }
  ]
}`
};

const templateContentsApi3 = {
  'libs/__projectName__/api-interfaces/tsconfig.lib.json.template': `{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "../../../dist/out-tsc",
    "declaration": true,
    "types": []
  },
  "include": ["**/*.ts"],
  "exclude": ["jest.config.ts", "**/*.spec.ts", "**/*.test.ts"]
}`
};

// Función para escribir el contenido en los archivos template
function writeTemplateContent(templatesObj) {
  console.log('Iniciando la escritura de contenido en templates (Parte 8)...');

  for (const [filePath, content] of Object.entries(templatesObj)) {
    const fullPath = path.join(baseDir, filePath);

    if (fs.existsSync(fullPath)) {
      fs.writeFileSync(fullPath, content, 'utf8');
      console.log(`Contenido escrito en: ${fullPath}`);
    } else {
      console.error(`El archivo ${fullPath} no existe.`);
    }
  }

  console.log('¡Escritura de contenido completada para este conjunto de templates!');
}

// Si este script se ejecuta directamente
if (require.main === module) {
  writeTemplateContent(templateContentsApi1);
  writeTemplateContent(templateContentsApi2);
  writeTemplateContent(templateContentsApi3);
}







