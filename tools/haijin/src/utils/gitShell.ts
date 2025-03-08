import * as sh from "shelljs";
import * as path from "path";
import {SimpleGit, simpleGit} from "simple-git";
import { logger } from '@nx/devkit';

export class Git {
    dirApp: string;
    genBranch: string;
    localOnly: boolean;
    developerBranch: string;
    mainBranch: string;
    git: SimpleGit;

    constructor(
      appDir: string,
      generatorBranch: string = "base",
      localOnly: boolean = true,
      developerBranch: string = "develop",
      mainBranch: string = "main") {
        this.dirApp = appDir;
        this.genBranch = generatorBranch;
        this.localOnly = localOnly;
        this.developerBranch = developerBranch;
        this.mainBranch = mainBranch;
        this.git = simpleGit(this.dirApp);
    }

    async createAndCheckoutBranchWithGit(branchName: string): Promise<void> {
      try {
        const branches = await this.git.branch();

        // Si el branch existe, cambiar a él
        if (branches.all.includes(branchName)) {
          await this.git.checkout(branchName);
          logger.info(`Switched to existing branch: ${branchName}`);
        } else {
          // Si no existe, crearlo y cambiar a él
          await this.git.checkout(['-b', branchName]);
          logger.info(`Created and switched to new branch: ${branchName}`);
        }
      } catch (error) {
        logger.error(`Error checking out branch: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
      }
    }

    async hasUncommittedChangesWithGit(): Promise<boolean> {
      const status = await this.git.status();
      return status.files.length > 0;
    }

    async setCurrentBranchWithGit(branchName: string): Promise<void> {
      try {
        const branches = await this.git.branch();

        // Si el branch existe, cambiar a él
        if (branches.all.includes(branchName)) {
          await this.git.checkout(branchName);
          logger.info(`Switched to branch: ${branchName}`);
        } else {
          logger.error(`Branch ${branchName} does not exist`);
        }
      } catch (error) {
        logger.error(`Error setting current branch: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
      }
    }

    async prepareForGenerationWithGit(projectDir: string): Promise<void> {
      try {
        const status = await this.git.status();
        const currentBranch = status.current;

        if (currentBranch === 'base') {
          // Usar rm de git en lugar de execGitCommand
          await this.git.rm(['-r', `${projectDir}/*`]);
          logger.info(`${currentBranch} prepared`);
        } else {
          throw new Error('Not in base branch to clean up');
        }
      } catch (error) {
        logger.error(`Error preparing for generation: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
      }
    }

    async mergeWithGit(fromBranch: string, options: string[] = []): Promise<void> {
      try {
        // Opciones por defecto para merge
        const mergeOptions = [fromBranch, ...options];

        // Ejecutar merge
        await this.git.merge(mergeOptions);
        logger.info(`Successfully merged from ${fromBranch}`);
      } catch (error) {
        logger.error(`Error merging from ${fromBranch}: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
      }
    }

    async commitWithGit(message: string): Promise<void> {
      try {
        // Añadir todos los archivos
        await this.git.add('./*');

        // Hacer commit
        await this.git.commit(message);
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

    async validateHaijinGitStateWithGit(): Promise<{ valid: boolean; message?: string; originalBranch?: string; }> {
      try {
        // Obtener branch actual
        const status = await this.git.status();
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

    async prepareForGeneration(projectDir: string) {
        const files = await this.hasPendingCommits(this.developerBranch);
        if (files.length === 0) {
            await this.git.checkout(this.genBranch);
            await this.git.rm(["-r", `${projectDir}/*`]);
        } else {
            const filesStr = files.map(x=>x.path).join("\n");
            throw Error(`${this.developerBranch} has pending commits\n${filesStr}`)
        }
    }

    async revertPrepareForGeneration() {
        await this.git.reset(["--hard", "HEAD"]);
        // await sh.exec(`git -C ${this.dirApp}/ reset --hard HEAD`);
    }

    async addAndCommit(message: string) {
        await this.git.add("./*");
        await this.git.commit(message);
    }

    async getLastMessage() {
        const message = await this.git.log(["-1", "--pretty=%B"]);
        return message && message.latest ? message.latest.hash : "base changes";
    }

    async hasPendingCommits(branchName: string) {
        await this.git.checkout(branchName);
        const status = await this.git.status();
        return status.files;
    }

    async mergeToDevelop(_rebase=true) {
        await this.git.checkout(this.developerBranch);
        // if (rebase) {
        //     await this.git.rebase([this.genBranch]); // One commit per change/conflict but flattened history
        // } else {
        //     await this.git.merge([this.genBranch]); // simplest way but complex history
        // }
    }

    async patchToDevelop() {
        await this.git.checkout(this.genBranch);
        const fileName = await this.git.raw("format-patch", "-n", "HEAD^");
        const patchFilePath = path.join(this.dirApp, fileName.trim());
        await this.git.checkout(this.developerBranch);
        await this.git.applyPatch([patchFilePath], ["--ignore-space-change", "--ignore-whitespace", '--verbose']);
    }

    async rebaseToDevelop(_rebase=true) {
        await this.git.checkout(this.developerBranch);
        await this.git.rebase([this.genBranch]);
    }

    async goBack() {
        await sh.exec(`git -C ${this.dirApp}/ checkout HEAD~`);
    }

    async goForward() {
        await sh.exec(`git -C ${this.dirApp}/ checkout $(git rev-list -C ${this.dirApp} --topo-order HEAD.."$*" | tail -1)`);
    }
}
