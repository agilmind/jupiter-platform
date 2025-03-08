import { logger, Tree, installPackagesTask } from '@nx/devkit';
import { execSync } from 'child_process';
import * as fs from 'fs-extra';
import * as path from 'path';
import { Git } from './gitShell';

// Función para generar archivos de manera sincrónica (en lugar de usar generateFiles de nx)
function generateFilesSync(sourcePath: string, targetPath: string, options: any) {
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Template directory not found: ${sourcePath}`);
  }

  // Asegurarse de que el directorio destino existe
  fs.ensureDirSync(targetPath);

  // Leer todos los archivos de la plantilla
  const files = fs.readdirSync(sourcePath, { withFileTypes: true });

  files.forEach(file => {
    const sourceFilePath = path.join(sourcePath, file.name);
    let targetFileName = file.name.replace(/__dot__/g, '.');
    const targetFilePath = path.join(targetPath, targetFileName);

    if (file.isDirectory()) {
      // Recursivamente procesar subdirectorios
      generateFilesSync(sourceFilePath, targetFilePath, options);
    } else {
      // Leer contenido del archivo
      let content = fs.readFileSync(sourceFilePath, 'utf8');

      // Procesar plantillas (similar a lo que hace generateFiles de nx)
      // Este es un procesamiento simple, se puede hacer más sofisticado si es necesario
      for (const [key, value] of Object.entries(options)) {
        if (typeof value === 'string') {
          const regex = new RegExp(`<%= ${key} %>`, 'g');
          content = content.replace(regex, value);
        }
      }

      // Escribir el archivo procesado
      fs.writeFileSync(targetFilePath, content);
    }
  });

  logger.info(`Files generated in ${targetPath}`);
}

export interface AddProjectOptions {
  name: string;
  type: string;
  projectType: 'app' | 'service';
  options?: string;
  dependencies?: {
    prod?: string[];
    dev?: string[];
  };
  templatePath: string;
  projectUpdates?: (projectDir: string, projectName: string) => void;
  update?: boolean;
  cwd?: string;
}

export async function generateProject(tree: Tree, options: AddProjectOptions) {
  // Determinar directorio y nombre de proyecto
  const directoryPrefix = options.projectType === 'app' ? 'apps' : 'services';
  const projectPrefix = options.projectType === 'app' ? 'app' : 'services';

  const projectDir = `${directoryPrefix}/${options.name}`;
  const projectName = `${projectPrefix}-${options.name}`;
  const projectRoot = path.join(process.cwd(), projectDir);

  // Inicializar Git con el directorio del workspace
  const git = new Git(process.cwd());

  try {
    // Verificar si el proyecto ya existe
    const projectExists = fs.existsSync(projectRoot);

    if (projectExists && !options.update) {
      // Preguntar si quiere actualizar el proyecto existente
      const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
      });

      const answer = await new Promise<string>(resolve => {
        readline.question(`Project ${options.name} already exists. Do you want to update it? (y/N): `, resolve);
      });

      readline.close();

      if (answer.toLowerCase() !== 'y') {
        logger.info('Update cancelled. Exiting...');
        return;
      }

      logger.info(`Updating ${options.type} ${options.projectType}: ${options.name}`);
    } else if (!projectExists) {
      logger.info(`Creating ${options.type} ${options.projectType}: ${options.name}`);
    }

    // Instalar dependencias si se especificaron
    if (options.dependencies) {
      logger.info('Installing dependencies...');

      if (options.dependencies.prod && options.dependencies.prod.length > 0) {
        execSync(`npm install ${options.dependencies.prod.join(' ')} --save --legacy-peer-deps`, { stdio: 'inherit' });
      }

      if (options.dependencies.dev && options.dependencies.dev.length > 0) {
        execSync(`npm install ${options.dependencies.dev.join(' ')} --save-dev --legacy-peer-deps`, { stdio: 'inherit' });
      }
    }

    // 1. Si es la primera vez, inicializar Git
    if (!projectExists) {
      // Crear el directorio del proyecto
      fs.ensureDirSync(projectRoot);

      // Inicializar Git en el directorio principal
      logger.info('Initializing Git workflow...');
      await git.init(options.name);
    }

    // 2. Preparar para generación (checkout a base y limpiar)
    try {
      await git.prepareForGeneration(projectDir);
      logger.info('Prepared for generation in base branch');

      // 3. Generar archivos de manera sincrónica (en lugar de usar generateFiles de nx)
      logger.info('Generating project files...');
      generateFilesSync(
        options.templatePath,
        projectRoot,
        {
          ...options,
          template: '',
          dot: '.'
        }
      );

      // 4. Aplicar actualizaciones específicas si es necesario
      if (options.projectUpdates) {
        options.projectUpdates(projectDir, projectName);
      }

      // 5. Git: add y commit
      const action = projectExists ? 'Update' : 'Add';
      await git.addAndCommit(`${action} ${options.type} ${options.projectType}: ${options.name}`);
      logger.info(`Changes committed to base branch`);

      // 6. Pasar los cambios a develop
      if (projectExists) {
        // Si ya existía, usar patch para aplicar los cambios
        await git.patchToDevelop();
        logger.info('Applied patch to develop branch');
      } else {
        // Si es nuevo, usar rebase para sincronizar
        await git.rebaseToDevelop();
        logger.info('Rebased changes to develop branch');
      }

      const resultAction = projectExists ? 'updated' : 'created';
      logger.info(`✅ ${options.type} ${options.projectType} ${options.name} ${resultAction} successfully!`);

      // Para mantener consistencia con Nx, devolvemos una función que instala dependencias
      return () => {
        installPackagesTask(tree);
      };
    } catch (error) {
      // Si algo sale mal, revertir los cambios
      await git.revertPrepareForGeneration();
      logger.error(`Failed to ${projectExists ? 'update' : 'create'} ${options.type} ${options.projectType}: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  } catch (error) {
    logger.error(`Project generation failed: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}
