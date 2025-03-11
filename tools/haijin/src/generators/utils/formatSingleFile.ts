import { logger } from '@nx/devkit';
import * as prettier from 'prettier';
import * as path from 'path';

// Función para formatear un solo archivo con la configuración de Nx
async function formatSingleFile(tree, filePath, content) {
  try {
    // 1. Obtener la configuración de Prettier desde el proyecto
    const prettierConfig = await prettier.resolveConfig(process.cwd());

    // 2. Determinar el parser basado en la extensión
    const parser = getParserForFile(filePath);

    // 3. Formatear el contenido
    const formattedContent = prettier.format(content, {
      ...prettierConfig,
      parser,
    });

    // 4. Escribir al tree
    tree.write(filePath, formattedContent);

    return true;
  } catch (error) {
    logger.warn(`Error formatting file ${filePath}: ${error.message}`);
    // Si falla el formateo, escribir el contenido original
    tree.write(filePath, content);
    return false;
  }
}

function getParserForFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.ts':
    case '.tsx':
      return 'typescript';
    case '.js':
    case '.jsx':
      return 'babel';
    case '.json':
      return 'json';
    case '.graphql':
    case '.gql':
      return 'graphql';
    case '.css':
      return 'css';
    case '.scss':
      return 'scss';
    case '.less':
      return 'less';
    case '.html':
      return 'html';
    case '.md':
      return 'markdown';
    case '.yaml':
    case '.yml':
      return 'yaml';
    default:
      return 'babel'; // fallback
  }
}
