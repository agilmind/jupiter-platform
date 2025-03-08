import { formatFiles, logger, Tree, installPackagesTask } from '@nx/devkit';
import { execSync } from 'child_process';
import * as fs from 'fs-extra';
import * as path from 'path';
import { NxProjectGit } from './gitExtender';

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

    // Procesar el nombre del archivo:
    // 1. Reemplazar __dot__ por .
    // 2. Eliminar la extensión .template
    let targetFileName = file.name
      .replace(/__dot__/g, '.')
      .replace(/\.template$/, '');

    // 3. Procesar variables en el nombre del archivo (similar a __dot__)
    targetFileName = targetFileName.replace(/__([a-zA-Z0-9]+)__/g, (match, key) => {
      return options[key] || match;
    });

    const targetFilePath = path.join(targetPath, targetFileName);

    if (file.isDirectory()) {
      // Recursivamente procesar subdirectorios
      generateFilesSync(sourceFilePath, targetFilePath, options);
    } else {
      // Leer contenido del archivo
      let content = fs.readFileSync(sourceFilePath, 'utf8');

      // Procesamiento de plantilla mejorado que soporta tanto <%= variable %> como <%= expresión %>
      content = content.replace(/<%=\s*([^%>]+)\s*%>/g, (match, expr) => {
        try {
          // Si es una variable simple (sin espacios o operadores), usar directamente
          if (/^[a-zA-Z0-9_]+$/.test(expr.trim())) {
            const key = expr.trim();
            return options[key] !== undefined ? options[key] : match;
          }

          // Si es una expresión más compleja, evaluar con un contexto seguro
          const sandbox = { ...options };
          const result = new Function(...Object.keys(sandbox), `return ${expr}`)(
            ...Object.values(sandbox)
          );

          return result !== undefined ? result : match;
        } catch (e) {
          // Si algo falla, dejar la expresión original
          logger.warn(`Error processing expression: ${expr}`);
          return match;
        }
      });

      // Escribir el archivo procesado
      fs.writeFileSync(targetFilePath, content);
      logger.debug(`Generated file: ${targetFilePath}`);
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

  // Inicializar GitExtender con el directorio del workspace y el directorio del proyecto
  const projectGit = new NxProjectGit(process.cwd(), projectDir);

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

    // 1. Asegurarse de que las ramas base y develop existen
    await projectGit.ensureBranches();

    // 2. Preparar para generación (checkout a base y limpiar SOLO el directorio del proyecto)
    try {
      await projectGit.prepareForGeneration();
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

      // 5. Git: add y commit SOLO los archivos del proyecto
      const action = projectExists ? 'Update' : 'Add';
      await projectGit.addAndCommit(`${action} ${options.type} ${options.projectType}: ${options.name}`);
      logger.info(`Changes committed to base branch`);

      // 6. Pasar los cambios a develop
      try {
        if (projectExists) {
          // Si ya existía, usar patch para aplicar los cambios
          await projectGit.patchToDevelop();
          logger.info('Applied patch to develop branch');
        } else {
          // Si es nuevo, usar rebase para sincronizar
          await projectGit.rebaseToDevelop();
          logger.info('Rebased changes to develop branch');
        }

        const resultAction = projectExists ? 'updated' : 'created';
        logger.info(`✅ ${options.type} ${options.projectType} ${options.name} ${resultAction} successfully!`);

        // Para mantener consistencia con Nx, devolvemos una función que instala dependencias
        return () => {
          installPackagesTask(tree);
        };
      } catch (gitMergeError) {
        // Capturar específicamente errores en la etapa de merge/rebase
        logger.error(`Git merge/rebase failed: ${gitMergeError instanceof Error ? gitMergeError.message : String(gitMergeError)}`);

        // Intentar volver al estado original
        await projectGit.revertPrepareForGeneration();
        logger.info('Reverted changes due to merge failure');

        // Propagar el error para que el usuario sepa que algo falló
        throw new Error(`Failed to ${projectExists ? 'update' : 'create'} ${options.type} ${options.projectType}: ${gitMergeError instanceof Error ? gitMergeError.message : String(gitMergeError)}`);
      }
    } catch (error) {
      // Si algo sale mal en cualquier paso después de prepareForGeneration
      logger.error(`Generation process failed: ${error instanceof Error ? error.message : String(error)}`);

      // Intentar revertir los cambios
      try {
        await projectGit.revertPrepareForGeneration();
        logger.info('Reverted changes due to error');
      } catch (revertError) {
        logger.error(`Failed to revert changes: ${revertError instanceof Error ? revertError.message : String(revertError)}`);
      }

      throw new Error(`Failed to ${projectExists ? 'update' : 'create'} ${options.type} ${options.projectType}: ${error instanceof Error ? error.message : String(error)}`);
    }
  } catch (error) {
    logger.error(`Project generation failed: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}
