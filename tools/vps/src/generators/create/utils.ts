import { Tree, logger, readJson } from '@nx/devkit';

/**
 * Helper to get the default branch from nx.json or default to 'main'.
 */
export function getDefaultBranch(tree: Tree): string {
  let branch = 'main'; // Default
  try {
    // Usar readJson para parseo seguro
    const nxJson = readJson<any>(tree, 'nx.json');
    // Buscar en propiedades comunes
    branch = nxJson?.defaultBase || nxJson?.affected?.defaultBase || 'main';
  } catch (e) {
    logger.warn(
      "Could not read or parse nx.json to get default branch. Defaulting to 'main'."
    );
    branch = 'main';
  }
  // Quitar el log de aquí para evitar duplicados, el que llama puede loguear si quiere
  // logger.info(`Using default branch for trigger: ${branch}`);
  return branch;
}

// Puedes añadir otras funciones de utilidad aquí en el futuro
