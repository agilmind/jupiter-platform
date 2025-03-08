import { logger } from '@nx/devkit';
import { execSync } from 'child_process';

// Tipos para configuración
export interface GitOptions {
  cwd?: string;
  silent?: boolean;
}

// Opciones por defecto
const defaultOptions: GitOptions = {
  cwd: process.cwd(),
  silent: false
};

/**
 * Ejecuta un comando Git y devuelve su salida
 */
export function execGitCommand(command: string, options: GitOptions = {}): string {
  const opts = { ...defaultOptions, ...options };
  try {
    const output = execSync(`git ${command}`, {
      cwd: opts.cwd,
      encoding: 'utf8',
      stdio: opts.silent ? 'pipe' : 'inherit'
    });
    return output?.toString().trim() || '';
  } catch (error) {
    if (!opts.silent) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Git command failed: 'git ${command}'\n${errorMessage}`);
    }
    throw error;
  }
}

/**
 * Verifica si estamos en un repositorio Git
 */
export function isGitRepo(options: GitOptions = {}): boolean {
  try {
    execGitCommand('rev-parse --is-inside-work-tree', { ...options, silent: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * Obtiene el nombre del branch actual
 */
export function getCurrentBranch(options: GitOptions = {}): string {
  return execGitCommand('rev-parse --abbrev-ref HEAD', { ...options, silent: true });
}

/**
 * Verifica si hay cambios pendientes
 */
export function hasUncommittedChanges(options: GitOptions = {}): boolean {
  const status = execGitCommand('status --porcelain', { ...options, silent: true });
  return status.length > 0;
}

/**
 * Verifica si existe un branch específico
 */
export function branchExists(branchName: string, options: GitOptions = {}): boolean {
  try {
    const branches = execGitCommand('branch', { ...options, silent: true });
    const branchPattern = new RegExp(`\\b${branchName}\\b`);
    return branchPattern.test(branches);
  } catch {
    return false;
  }
}

/**
 * Crea y cambia a un nuevo branch
 */
export function createAndCheckoutBranch(branchName: string, options: GitOptions = {}): void {
  if (branchExists(branchName, options)) {
    execGitCommand(`checkout ${branchName}`, options);
    logger.info(`Switched to existing branch: ${branchName}`);
  } else {
    execGitCommand(`checkout -b ${branchName}`, options);
    logger.info(`Created and switched to new branch: ${branchName}`);
  }
}

/**
 * Crea y cambia a un nuevo branch
 */
export function setCurrentBranch(branchName: string, options: GitOptions = {}): void {
  if (branchExists(branchName, options)) {
    execGitCommand(`checkout ${branchName}`, options);
    logger.info(`Switched to existing branch: ${branchName}`);
  }
}

/**
 * Añade archivos al stage
 */
export function addFiles(pattern = '.', options: GitOptions = {}): void {
  execGitCommand(`add ${pattern}`, options);
}

/**
 * Crea un commit con el mensaje especificado
 */
export function commit(message: string, options: GitOptions = {}): void {
  try {
    execGitCommand(`commit -m "${message}"`, options);
    logger.info(`Created commit: ${message}`);
  } catch (error) {
    // Si no hay cambios para commit, no es un error fatal
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (errorMsg.includes('nothing to commit')) {
      logger.info('No changes to commit');
    } else {
      throw error;
    }
  }
}

/**
 * Verifica el estado del repositorio para Haijin (debe estar en main sin cambios)
 */
export function validateHaijinGitState(options: GitOptions = {}): { valid: boolean; message?: string; originalBranch?: string; } {
  let originalBranch;
  try {
    // Verificar si estamos en un repo Git
    if (!isGitRepo(options)) {
      return { valid: false, message: 'Not a Git repository. Please run git init first.', originalBranch: originalBranch };
    }

    // Verificar branch
    const currentBranch = getCurrentBranch(options);
    // if (currentBranch !== 'main') {
    //   return { valid: false, message: `You must be on the main branch to run this generator. Current branch: ${currentBranch}` };
    // }

    // Verificar cambios pendientes
    if (hasUncommittedChanges(options)) {
      return {
        valid: false,
        message: `You have uncommitted changes on "${currentBranch}". Please commit or stash them before running this generator.`,
        originalBranch: currentBranch };
    }

    return { valid: true, originalBranch: currentBranch };
  } catch (error) {
    return {
      valid: false,
      message: `Error validating Git state: ${error instanceof Error ? error.message : String(error)}`,
      originalBranch: originalBranch,
    };
  }
}
