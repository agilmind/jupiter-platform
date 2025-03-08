import { Tree } from '@nx/devkit';

/**
 * Elimina todos los archivos en un directorio excepto los excluidos
 */
export function cleanDirectoryExcept(tree: Tree, directory: string, excludePatterns: string[] = []) {
  // Listar todos los archivos y carpetas en el directorio
  const entries = tree.children(directory);

  // Determinar qué entradas excluir
  const entriesToRemove = entries.filter(entry => {
    // No eliminar si coincide con algún patrón excluido
    return !excludePatterns.some(pattern => {
      if (pattern.endsWith('*')) {
        // Si el patrón termina con *, comprobar si la entrada comienza con el patrón sin *
        const prefixPattern = pattern.slice(0, -1);
        return entry.startsWith(prefixPattern);
      }
      // Comparación exacta
      return entry === pattern;
    });
  });

  // Eliminar entradas
  for (const entry of entriesToRemove) {
    const fullPath = `${directory}/${entry}`;
    if (tree.isFile(fullPath)) {
      tree.delete(fullPath);
    } else if (tree.exists(fullPath)) {
      // Es un directorio, eliminarlo recursivamente
      cleanDirectoryExcept(tree, fullPath, []);
      tree.delete(fullPath);
    }
  }
}
