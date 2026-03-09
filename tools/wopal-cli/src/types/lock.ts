/**
 * 锁文件类型定义（统一 v3 格式）
 *
 * 项目级锁文件（./agents/.skill-lock.json）和全局级锁文件（~/.agents/.skill-lock.json）
 * 都使用相同的 v3 格式，便于维护和迁移。
 */

/**
 * 技能锁文件条目（v3 格式）
 */
export interface SkillLockEntry {
  /** 源标识（owner/repo 或 my-skills/skill-name） */
  source: string;

  /** 源类型 */
  sourceType: "github" | "local";

  /** 源 URL（GitHub URL 或本地路径） */
  sourceUrl: string;

  /** 技能路径（仓库内路径或本地路径） */
  skillPath: string;

  /** 版本指纹（远程=GitHub Tree SHA，本地=SHA-256） */
  skillFolderHash: string;

  /** 安装时间（ISO 时间戳） */
  installedAt: string;

  /** 更新时间（ISO 时间戳） */
  updatedAt: string;
}

/**
 * 全局锁文件（v3 格式）
 * 存储在 ~/.agents/.skill-lock.json
 */
export interface SkillLockFile {
  /** 版本号（固定为 3） */
  version: 3;

  /** 技能列表（key 为技能名） */
  skills: Record<string, SkillLockEntry>;

  /** 用户忽略的提示（仅全局锁需要） */
  dismissed?: {
    findSkillsPrompt?: boolean;
  };
}

/**
 * 项目锁文件（v3 格式）
 * 存储在 ./agents/.skill-lock.json
 *
 * 注意：与全局锁格式完全一致，唯一差异是文件位置和 dismissed 字段（项目锁不需要）
 */
export type LocalSkillLockFile = SkillLockFile;

/**
 * 安装模式
 */
export type InstallMode = "copy" | "symlink";

/**
 * 安装范围
 */
export type InstallScope = "project" | "global";
