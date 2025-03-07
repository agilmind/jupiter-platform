// tools/haiku/src/utils/git.ts
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
 * Inicializa un repositorio Git si no existe
 */
export function initGitRepo(options: GitOptions = {}): void {
  if (!isGitRepo(options)) {
    execGitCommand('init', options);
    logger.info('Initialized new Git repository');
  }
}

/**
 * Configura Git con nombre y email si no están configurados
 */
export function configureGit(
  name = 'Haiku Generator',
  email = 'haiku-generator@example.com',
  options: GitOptions = {}
): void {
  try {
    // Verificar si ya hay configuración
    try {
      execGitCommand('config user.name', { ...options, silent: true });
      execGitCommand('config user.email', { ...options, silent: true });
    } catch {
      // Configurar si no existe
      execGitCommand(`config user.name "${name}"`, options);
      execGitCommand(`config user.email "${email}"`, options);
      logger.info('Configured Git user settings');
    }
  } catch (error) {
    logger.error(`Failed to configure Git: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
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
 * Verifica el estado del repositorio para Haiku (debe estar en main sin cambios)
 */
export function validateHaikuGitState(options: GitOptions = {}): { valid: boolean; message?: string } {
  try {
    // Verificar si estamos en un repo Git
    if (!isGitRepo(options)) {
      return { valid: false, message: 'Not a Git repository. Please run git init first.' };
    }

    // Verificar branch
    const currentBranch = getCurrentBranch(options);
    if (currentBranch !== 'main') {
      return { valid: false, message: `You must be on the main branch to run this generator. Current branch: ${currentBranch}` };
    }

    // Verificar cambios pendientes
    if (hasUncommittedChanges(options)) {
      return { valid: false, message: 'You have uncommitted changes. Please commit or stash them before running this generator.' };
    }

    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      message: `Error validating Git state: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Configura las ramas base y develop para un proyecto Haiku
 */
export function setupHaikuBranches(options: GitOptions = {}): void {
  try {
    // Crear branch base si no existe
    if (!branchExists('base', options)) {
      createAndCheckoutBranch('base', options);

      // Intentar añadir archivos al stage
      addFiles('.', options);

      // Verificar si hay cambios para confirmar
      const hasChanges = hasUncommittedChanges(options);

      if (hasChanges) {
        commit('Initial commit for base branch', options);
      } else {
        // Crear un archivo dummy si no hay cambios
        const dummyFile = '.haiku';
        logger.info('No changes to commit, creating dummy file');

        // Crear el archivo
        const fs = require('fs');
        fs.writeFileSync(options.cwd ? `${options.cwd}/${dummyFile}` : dummyFile,
          'This file was generated by Haiku to ensure the base branch has at least one commit.');

        // Añadir y hacer commit
        addFiles(dummyFile, options);
        commit('Initial commit for base branch', options);
      }
    }

    // Crear o cambiar a branch develop
    createAndCheckoutBranch('develop', options);
    logger.info('Successfully set up Haiku branches (base, develop)');
  } catch (error) {
    logger.error(`Failed to set up Haiku branches: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}
