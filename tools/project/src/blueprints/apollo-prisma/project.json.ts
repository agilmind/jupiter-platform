import { GeneratorOptions } from '../types';

export function projectJson(options: GeneratorOptions): string {
  const { projectName } = options;
  const projectId = `${projectName}-app-server`;

  return `{
  "$schema": "../../../node_modules/nx/schemas/project-schema.json",
  "name": "${projectId}",
  "projectType": "application",
  "sourceRoot": "apps/${projectName}/app-server/src",
  "tags": [],
  "targets": {
    "build": {
      "executor": "@nx/js:tsc",
      "outputs": ["{options.outputPath}"],
      "options": {
        "outputPath": "dist/apps/${projectName}/app-server",
        "main": "apps/${projectName}/app-server/src/main.ts",
        "tsConfig": "apps/${projectName}/app-server/tsconfig.app.json",
        "assets": []
      }
    },
    "serve": {
      "executor": "nx:run-commands",
      "options": {
        "command": "npx tsx --watch apps/${projectName}/app-server/src/main.ts"
      }
    }
  }
}`;
}
