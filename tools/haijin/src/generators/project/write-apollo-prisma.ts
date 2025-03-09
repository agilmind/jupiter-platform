import { ProjectGeneratorSchema } from './schema';
import { logger } from '@nx/devkit';
import * as path from 'path';
import * as fs from 'fs-extra';

export function writeApolloPrismaFiles(options: ProjectGeneratorSchema) {
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
          } catch {
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
  processTemplateDir(path.join(process.cwd(), "tools/haijin/src/generators/files", options.currentServiceType));
  logger.info(`Processed ${processedFiles.length} template files, ready for Git operations`);
  return processedFiles;
}
