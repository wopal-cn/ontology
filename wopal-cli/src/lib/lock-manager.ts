import fs from "fs-extra";
import type { SkillLockFile, SkillLockEntry } from "../types/lock.js";
import type { ConfigService } from "./config.js";

export class LockManager {
  private projectLockPath: string;
  private globalLockPath: string;

  constructor(configService: ConfigService) {
    this.projectLockPath = configService.getProjectLockPath();
    this.globalLockPath = configService.getGlobalLockPath();
  }

  async readGlobalLock(): Promise<SkillLockFile> {
    return this.readLockFile(this.globalLockPath);
  }

  async writeGlobalLock(lockFile: SkillLockFile): Promise<void> {
    await this.writeLockFile(this.globalLockPath, lockFile, false);
  }

  async readProjectLock(): Promise<SkillLockFile> {
    return this.readLockFile(this.projectLockPath);
  }

  async writeProjectLock(lockFile: SkillLockFile): Promise<void> {
    await this.writeLockFile(this.projectLockPath, lockFile, true);
  }

  async addSkillToBothLocks(
    skillName: string,
    entry: SkillLockEntry,
  ): Promise<void> {
    const [projectLock, globalLock] = await Promise.all([
      this.readProjectLock(),
      this.readGlobalLock(),
    ]);

    const now = new Date().toISOString();
    const entryWithTimestamp = {
      ...entry,
      updatedAt: now,
    };

    projectLock.skills[skillName] = entryWithTimestamp;
    globalLock.skills[skillName] = entryWithTimestamp;

    await Promise.all([
      this.writeProjectLock(projectLock),
      this.writeGlobalLock(globalLock),
    ]);
  }

  private async readLockFile(lockPath: string): Promise<SkillLockFile> {
    try {
      if (!(await fs.pathExists(lockPath))) {
        return this.createEmptyLockFile();
      }

      const content = await fs.readJson(lockPath);

      if (!content || typeof content !== "object") {
        return this.createEmptyLockFile();
      }

      if (content.version < 3) {
        return this.createEmptyLockFile();
      }

      return content as SkillLockFile;
    } catch {
      return this.createEmptyLockFile();
    }
  }

  private async writeLockFile(
    lockPath: string,
    lockFile: SkillLockFile,
    sortSkills: boolean,
  ): Promise<void> {
    const dir = this.getLockDir(lockPath);
    await fs.ensureDir(dir);

    let skillsToWrite = lockFile.skills;
    if (sortSkills) {
      const sortedKeys = Object.keys(lockFile.skills).sort();
      const sortedSkills: Record<string, SkillLockEntry> = {};
      for (const key of sortedKeys) {
        sortedSkills[key] = lockFile.skills[key];
      }
      skillsToWrite = sortedSkills;
    }

    const contentToWrite: SkillLockFile = {
      ...lockFile,
      skills: skillsToWrite,
    };

    const tempPath = `${lockPath}.tmp`;
    await fs.writeJson(tempPath, contentToWrite, { spaces: 2 });
    await fs.rename(tempPath, lockPath);
  }

  private getLockDir(lockPath: string): string {
    const parts = lockPath.split("/");
    parts.pop();
    return parts.join("/");
  }

  private createEmptyLockFile(): SkillLockFile {
    return {
      version: 3,
      skills: {},
    };
  }

  getProjectLockPath(): string {
    return this.projectLockPath;
  }

  getGlobalLockPath(): string {
    return this.globalLockPath;
  }
}
