import { logger, Tree, installPackagesTask } from '@nx/devkit';
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

    // FASE 1: Procesar las plantillas mientras estamos en main y guardar el contenido en memoria
    logger.info('Processing template files while in main branch...');

    // Estructura para almacenar el contenido procesado de los archivos
    const processedFiles = [];

    // Función recursiva para procesar directorios y guardar contenido
    const processTemplateDir = (sourcePath, relativePath = '') => {
      if (!fs.existsSync(sourcePath)) {
        throw new Error(`Template directory not found: ${sourcePath}`);
      }

      const files = fs.readdirSync(sourcePath, { withFileTypes: true });

      files.forEach(file => {
        const sourceFilePath = path.join(sourcePath, file.name);
        let targetFileName = file.name
          .replace(/__dot__/g, '.')
          .replace(/\.template$/, '');

        // Procesar variables en el nombre del archivo
        targetFileName = targetFileName.replace(/__([a-zA-Z0-9]+)__/g, (match, key) => {
          return options[key] || match;
        });

        const targetRelativePath = path.join(relativePath, targetFileName);

        if (file.isDirectory()) {
          // Procesar subdirectorios recursivamente
          processTemplateDir(sourceFilePath, targetRelativePath);
        } else {
          // Leer y procesar el contenido del archivo
          let content = fs.readFileSync(sourceFilePath, 'utf8');

          // Procesamiento de plantilla
          content = content.replace(/<%=\s*([^%>]+)\s*%>/g, (match, expr) => {
            try {
              if (/^[a-zA-Z0-9_]+$/.test(expr.trim())) {
                const key = expr.trim();
                return options[key] !== undefined ? options[key] : match;
              }

              const sandbox = { ...options };
              const result = new Function(...Object.keys(sandbox), `return ${expr}`)(
                ...Object.values(sandbox)
              );

              return result !== undefined ? result : match;
            } catch (e) {
              logger.warn(`Error processing expression: ${expr}`);
              return match;
            }
          });

          // Guardar el contenido procesado y la ruta relativa para escribirlo después
          processedFiles.push({
            relativePath: targetRelativePath,
            content
          });

          logger.debug(`Processed template: ${targetRelativePath}`);
        }
      });
    };

    // Procesar todos los templates y guardar contenido
    processTemplateDir(options.templatePath);
    logger.info(`Processed ${processedFiles.length} template files, ready for Git operations`);

    // FASE 2: Ejecutar operaciones Git y escribir archivos procesados
    // Esta función se ejecutará DESPUÉS de que Nx complete sus operaciones
    return async () => {
      // Guardar la rama original
      const originalBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
      logger.info(`Starting Git operations (current branch: ${originalBranch})`);

      // Inicializar GitExtender con el directorio del workspace y el directorio del proyecto
      const projectGit = new NxProjectGit(process.cwd(), projectDir);

      try {
        // 1. Asegurarse de que las ramas base y develop existen
        await projectGit.ensureBranches();

        // 2. Eliminar archivos en la rama actual para poder cambiar a base
        if (fs.existsSync(projectRoot)) {
          logger.info(`Removing files in current branch before checkout...`);
          fs.removeSync(projectRoot);
        }

        // 3. Cambiar a la rama base
        await projectGit.rootGit.git.checkout('base');
        logger.info('Switched to base branch');

        // 4. Limpiar directorio en base si existe
        try {
          await projectGit.rootGit.git.rm(['-r', `${projectDir}/*`]);
          logger.info('Cleaned existing files in base branch');
        } catch (rmError) {
          if (rmError.message.includes('did not match any files')) {
            logger.info('No existing files to clean in base branch');
          } else {
            throw rmError;
          }
        }

        // 5. Escribir archivos procesados en la rama base
        logger.info(`Writing processed files to base branch...`);

        for (const file of processedFiles) {
          const fullPath = path.join(process.cwd(), projectDir, file.relativePath);

          // Asegurar que el directorio exista
          fs.ensureDirSync(path.dirname(fullPath));

          // Escribir el contenido procesado
          fs.writeFileSync(fullPath, file.content);
          logger.debug(`Wrote file: ${fullPath}`);
        }

        logger.info(`Successfully wrote ${processedFiles.length} files to base branch`);

        // 6. Git add y commit
        const action = projectExists ? 'Update' : 'Add';
        await projectGit.addAndCommit(`${action} ${options.type} ${options.projectType}: ${options.name}`);
        logger.info(`Changes committed to base branch`);

        // 7. Pasar cambios a develop
        let conflictsDetected = false;

        if (projectExists) {
          // Si ya existía, usar patch para aplicar los cambios
          const patchSuccess = await projectGit.patchToDevelop();
          if (!patchSuccess) {
            conflictsDetected = true;
            logger.warn(`
==========================================================================
⚠️ ATENCIÓN: CONFLICTO EN LA APLICACIÓN DEL PARCHE

Se encontraron conflictos al intentar aplicar el parche a la rama develop.
Por favor, sigue las instrucciones anteriores para resolver los conflictos.

Una vez resueltos los conflictos, el proyecto estará actualizado en develop.
Los archivos ya fueron actualizados correctamente en la rama base.
==========================================================================`);
          } else {
            logger.info('Applied patch to develop branch');
          }
        } else {
          // Si es nuevo, usar rebase para sincronizar
          const rebaseSuccess = await projectGit.rebaseToDevelop();

          if (!rebaseSuccess) {
            conflictsDetected = true;
            logger.warn(`
==========================================================================
⚠️ ATENCIÓN: CONFLICTO DE REBASE DETECTADO

Se encontraron conflictos al intentar aplicar los cambios a la rama develop.
Por favor, sigue las instrucciones anteriores para resolver los conflictos.

Una vez resueltos todos los conflictos y completado el rebase, el proyecto
estará actualizado en la rama develop.

Los archivos ya fueron actualizados correctamente en la rama base.
==========================================================================`);
          } else {
            logger.info('Rebased changes to develop branch');
          }
        }

        // Si hay conflictos, no continuar con el flujo normal
        if (conflictsDetected) {
          // No volver a la rama original - dejar al usuario en el estado actual
          // para que pueda resolver los conflictos
          return;
        }

        // 8. Volver a la rama original
        if (originalBranch && originalBranch !== 'base' && originalBranch !== 'develop') {
          await projectGit.rootGit.git.checkout(originalBranch);
          logger.info(`Returned to original branch: ${originalBranch}`);

          // Eliminar archivos del proyecto en la rama original si existen
          if (fs.existsSync(projectRoot)) {
            logger.info(`Removing generated files from ${originalBranch} branch...`);
            fs.removeSync(projectRoot);
            logger.info(`Files removed from ${originalBranch} branch`);
          }
        }

        const resultAction = projectExists ? 'updated' : 'created';
        logger.info(`✅ ${options.type} ${options.projectType} ${options.name} ${resultAction} successfully!`);

        // Instalar dependencias
        installPackagesTask(tree);
      } catch (error) {
        logger.error(`Git operations failed: ${error instanceof Error ? error.message : String(error)}`);

        // Intentar volver a la rama original
        if (originalBranch) {
          try {
            await projectGit.rootGit.git.checkout(originalBranch);
            logger.info(`Returned to original branch: ${originalBranch}`);

            // Eliminar archivos del proyecto en la rama original
            if (fs.existsSync(projectRoot)) {
              logger.info(`Removing generated files from ${originalBranch} branch...`);
              fs.removeSync(projectRoot);
            }
          } catch (checkoutError) {
            logger.error(`Failed to return to original branch: ${checkoutError.message}`);
          }
        }

        throw new Error(`Failed to ${projectExists ? 'update' : 'create'} ${options.type} ${options.projectType}: ${error instanceof Error ? error.message : String(error)}`);
      }
    };
  } catch (error) {
    logger.error(`Project generation failed: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}
