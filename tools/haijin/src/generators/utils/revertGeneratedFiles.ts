import { Tree } from '@nx/devkit';

/**
 * Revierte los archivos generados usando el directorio de plantillas como referencia
 * @param tree El árbol de archivos
 * @param templatePath Ruta a los templates en el sistema de archivos
 * @param targetDir Directorio donde se escribieron los archivos
 * @param options Opciones usadas en la generación (para sustituciones)
 */
function revertGeneratedFiles(
  tree: Tree,
  templatePath: string,
  targetDir: string,
  options: any
) {
  // Importaciones necesarias
  const fs = require('fs');
  const path = require('path');

  // Función para escanear el directorio de plantillas en el sistema de archivos real
  function scanTemplateDir(currentPath: string, basePath: string = ""): string[] {
    const results: string[] = [];

    // Leer el directorio físico de templates
    const entries = fs.readdirSync(currentPath);

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry);
      const relativePath = basePath ? `${basePath}/${entry}` : entry;
      const stats = fs.statSync(fullPath);

      if (stats.isDirectory()) {
        // Es un directorio, escanear recursivamente
        results.push(...scanTemplateDir(fullPath, relativePath));
      } else {
        // Es un archivo de plantilla, procesar el nombre
        // Remover la extensión .template si existe
        let targetFile = relativePath.replace(/\.template$/, "");

        // Aplicar las sustituciones que se usaron en generateFiles
        Object.entries(options).forEach(([key, value]) => {
          const token = `__${key}__`;
          if (typeof value === 'string') {
            targetFile = targetFile.replace(new RegExp(token, 'g'), value);
          }
        });

        results.push(targetFile);
      }
    }

    return results;
  }

  // Obtener lista de archivos generados basados en las plantillas
  try {
    const generatedFiles = scanTemplateDir(templatePath);

    // Eliminar cada archivo generado del directorio destino
    for (const file of generatedFiles) {
      const targetPath = `${targetDir}/${file}`;

      if (tree.exists(targetPath)) {
        console.log(`Eliminando archivo generado: ${targetPath}`);
        tree.delete(targetPath);
      }
    }

    // Limpiar directorios vacíos
    function removeEmptyDirs(dir: string) {
      if (!tree.exists(dir)) return;

      const children = tree.children(dir);
      if (children.length === 0) {
        console.log(`Eliminando directorio vacío: ${dir}`);
        tree.delete(dir);
        return;
      }

      // Procesar subdirectorios recursivamente
      for (const child of children) {
        const childPath = `${dir}/${child}`;
        if (!tree.isFile(childPath)) {
          removeEmptyDirs(childPath);
        }
      }

      // Verificar nuevamente si el directorio quedó vacío
      if (tree.children(dir).length === 0) {
        console.log(`Eliminando directorio vacío después de limpieza: ${dir}`);
        tree.delete(dir);
      }
    }

    // Limpiar directorios vacíos después de eliminar los archivos
    removeEmptyDirs(targetDir);

    console.log(`Revertida la generación de archivos en ${targetDir}`);
  } catch (error) {
    console.error(`Error al revertir la generación: ${error.message}`);
  }
}
