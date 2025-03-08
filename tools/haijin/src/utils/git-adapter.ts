import { Git } from './gitShell';
import { logger } from '@nx/devkit';

/**
 * Adaptador para validateHaijinGitState usando la clase Git
 */
export async function validateHaijinGitStateWithGit(git: Git): Promise<{ valid: boolean; message?: string; originalBranch?: string; }> {
  try {
    // Obtener branch actual
    const status = await git.git.status();
    const currentBranch = status.current;
    const originalBranch = currentBranch;

    // Verificar si hay cambios pendientes
    if (status.files.length > 0) {
      return {
        valid: false,
        message: `You have uncommitted changes on "${currentBranch}". Please commit or stash them before running this generator.`,
        originalBranch
      };
    }

    return { valid: true, originalBranch };
  } catch (error) {
    return {
      valid: false,
      message: `Error validating Git state: ${error instanceof Error ? error.message : String(error)}`,
      originalBranch: undefined,
    };
  }
}

/**
 * Adaptador para hasUncommittedChanges usando la clase Git
 */
export async function hasUncommittedChangesWithGit(git: Git): Promise<boolean> {
  const status = await git.git.status();
  return status.files.length > 0;
}

/**
 * Adaptador para createAndCheckoutBranch usando la clase Git
 */
export async function createAndCheckoutBranchWithGit(git: Git, branchName: string): Promise<void> {
  try {
    const branches = await git.git.branch();

    // Si el branch existe, cambiar a él
    if (branches.all.includes(branchName)) {
      await git.git.checkout(branchName);
      logger.info(`Switched to existing branch: ${branchName}`);
    } else {
      // Si no existe, crearlo y cambiar a él
      await git.git.checkout(['-b', branchName]);
      logger.info(`Created and switched to new branch: ${branchName}`);
    }
  } catch (error) {
    logger.error(`Error checking out branch: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

/**
 * Adaptador para setCurrentBranch usando la clase Git
 */
export async function setCurrentBranchWithGit(git: Git, branchName: string): Promise<void> {
  try {
    const branches = await git.git.branch();

    // Si el branch existe, cambiar a él
    if (branches.all.includes(branchName)) {
      await git.git.checkout(branchName);
      logger.info(`Switched to branch: ${branchName}`);
    } else {
      logger.error(`Branch ${branchName} does not exist`);
    }
  } catch (error) {
    logger.error(`Error setting current branch: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

/**
 * Adaptador para commit usando la clase Git
 */
export async function commitWithGit(git: Git, message: string): Promise<void> {
  try {
    // Añadir todos los archivos
    await git.git.add('./*');

    // Hacer commit
    await git.git.commit(message);
    logger.info(`Created commit: ${message}`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (errorMsg.includes('nothing to commit')) {
      logger.info('No changes to commit');
    } else {
      throw error;
    }
  }
}

/**
 * Adaptador para prepareForGerneration usando la clase Git
 */
export async function prepareForGenerationWithGit(git: Git, projectDir: string): Promise<void> {
  try {
    const status = await git.git.status();
    const currentBranch = status.current;

    if (currentBranch === 'base') {
      // Usar rm de git en lugar de execGitCommand
      await git.git.rm(['-r', `${projectDir}/*`]);
      logger.info(`${currentBranch} prepared`);
    } else {
      throw new Error('Not in base branch to clean up');
    }
  } catch (error) {
    logger.error(`Error preparing for generation: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

/**
 * Adaptador para merge usando la clase Git
 */
export async function mergeWithGit(git: Git, fromBranch: string, options: string[] = []): Promise<void> {
  try {
    // Opciones por defecto para merge
    const mergeOptions = [fromBranch, ...options];

    // Ejecutar merge
    await git.git.merge(mergeOptions);
    logger.info(`Successfully merged from ${fromBranch}`);
  } catch (error) {
    logger.error(`Error merging from ${fromBranch}: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}
