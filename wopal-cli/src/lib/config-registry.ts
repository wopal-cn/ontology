import { join } from "path";
import { homedir } from "os";

export interface ConfigContext {
  wopalHome: string;
  spacePath?: string;
}

export interface ConfigProperty {
  /** settings.jsonc 中的键名，null 表示仅支持环境变量或仅有默认值 */
  configKey?: string;
  /** 环境变量名，null 表示不支持环境变量 */
  envVar: string | null;
  /** 作用域：global（全局）或 space（空间级） */
  scope: "global" | "space";
  /** 默认值，支持字符串或基于 ConfigContext 的函数 */
  default: string | ((ctx: ConfigContext) => string);
  /** 相对路径的基准目录，仅当 default/configValue 为相对路径时生效 */
  relativeTo?: "spacePath" | "wopalHome";
}

export const CONFIG_REGISTRY: Record<string, ConfigProperty> = {
  wopalHome: {
    envVar: "WOPAL_HOME",
    scope: "global",
    default: () => join(homedir(), ".wopal"),
  },

  globalSkillsDir: {
    configKey: "globalSkillsDir",
    envVar: "WOPAL_GLOBAL_SKILLS_DIR",
    scope: "global",
    default: (ctx) => join(ctx.wopalHome, "skills"),
  },

  skillsDir: {
    configKey: "skillsDir",
    envVar: "WOPAL_SKILLS_DIR",
    scope: "space",
    default: ".wopal/skills",
    relativeTo: "spacePath",
  },

  skillsInboxDir: {
    configKey: "skillsInboxDir",
    envVar: "WOPAL_SKILLS_INBOX_DIR",
    scope: "space",
    default: ".wopal/skills/INBOX",
    relativeTo: "spacePath",
  },

  openclawIocDir: {
    envVar: null, // 不支持环境变量，固定路径
    scope: "global",
    default: (ctx) =>
      join(ctx.wopalHome, "storage", "openclaw-security-monitor"),
  },
};

export function getWopalHome(): string {
  return process.env.WOPAL_HOME || join(homedir(), ".wopal");
}
