import fs from "fs-extra";
import path from "path";
import os from "os";
import type { SkillLockFile, SkillLockEntry } from "../types/lock.js";
import type { ConfigService } from "./config.js";

/**
 * 锁文件管理器
 *
 * 管理项目级和全局级两个锁文件，统一使用 v3 格式
 */
export class LockManager {
  private projectLockPath: string;
  private globalLockPath: string;

  constructor(configService: ConfigService) {
    this.projectLockPath = configService.getProjectLockPath();
    this.globalLockPath = path.join(
      os.homedir(),
      ".agents",
      ".skill-lock.json",
    );
  }

  /**
   * 读取全局锁文件
   */
  async readGlobalLock(): Promise<SkillLockFile> {
    return this.readLockFile(this.globalLockPath);
  }

  /**
   * 写入全局锁文件
   */
  async writeGlobalLock(lockFile: SkillLockFile): Promise<void> {
    await this.writeLockFile(this.globalLockPath, lockFile, false);
  }

  /**
   * 读取项目锁文件
   */
  async readProjectLock(): Promise<SkillLockFile> {
    return this.readLockFile(this.projectLockPath);
  }

  /**
   * 写入项目锁文件（字母排序）
   */
  async writeProjectLock(lockFile: SkillLockFile): Promise<void> {
    await this.writeLockFile(this.projectLockPath, lockFile, true);
  }

  /**
   * 同时更新两个锁文件
   */
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

  /**
   * 读取锁文件（通用实现）
   */
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
    } catch (error) {
      return this.createEmptyLockFile();
    }
  }

  /**
   * 写入锁文件（通用实现）
   */
  private async writeLockFile(
    lockPath: string,
    lockFile: SkillLockFile,
    sortSkills: boolean,
  ): Promise<void> {
    const dir = path.dirname(lockPath);
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

  /**
   * 创建空锁文件
   */
  private createEmptyLockFile(): SkillLockFile {
    return {
      version: 3,
      skills: {},
    };
  }

  /**
   * 获取项目锁文件路径
   */
  getProjectLockPath(): string {
    return this.projectLockPath;
  }

  /**
   * 获取全局锁文件路径
   */
  getGlobalLockPath(): string {
    return this.globalLockPath;
  }
}
