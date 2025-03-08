import * as sh from "shelljs";
import path from "path";
import {SimpleGit, simpleGit} from "simple-git";
// import * as fs from "fs-extra";

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

    async prepareForGeneration() {
        const files = await this.hasPendingCommits(this.developerBranch);
        if (files.length === 0) {
            await this.git.checkout(this.genBranch);
            await this.git.rm(["-r", "./*"]);
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
