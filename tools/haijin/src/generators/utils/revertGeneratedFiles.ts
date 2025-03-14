import { Tree } from '@nx/devkit';

/**
 * Revierte los archivos generados usando el directorio de plantillas como referencia
 * @param tree El árbol de archivos
 * @param templatePath Ruta a los templates usados en generateFiles
 * @param targetDir Directorio donde se escribieron los archivos
 * @param options Opciones usadas en la generación (para sustituciones)
 */
export function revertGeneratedFiles(
  tree: Tree,
  templatePath: string,
  targetDir: string,
  options: any
) {
  // Obtener la estructura del directorio de plantillas
  function scanTemplateDir(currentPath: string, basePath: string = "") {
    const results: string[] = [];
    const entries = tree.children(currentPath);

    for (const entry of entries) {
      const fullPath = `${currentPath}/${entry}`;
      const relativePath = basePath ? `${basePath}/${entry}` : entry;

      if (!tree.isFile(fullPath)) {
        // Es un directorio, escanear recursivamente
        results.push(...scanTemplateDir(fullPath, relativePath));
      } else {
        // Es un archivo de plantilla, procesar el nombre
        // Remover la extensión .template si existe
        let targetFile = relativePath.replace(/\.template$/, "");

        // Aplicar las sustituciones que se usaron en generateFiles
        // Ejemplo: __fileName__ -> nombreReal
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
}
