import { homedir } from "os";
import { join } from "path";
import { mkdirSync, writeFileSync, existsSync } from "fs";
import { Logger } from "./logger.js";
import { loadEnv } from "./env-loader.js";
import { resolveConfig, loadSettingsFile } from "./config-resolver.js";
import { getWopalHome } from "./config-registry.js";

export interface SpaceConfig {
  path: string;
  skillsInboxDir?: string;
  skillsDir?: string;
  [key: string]: unknown;
}

export interface WopalConfig {
  activeSpace: string;
  globalSkillsDir?: string;
  spaces: Record<string, SpaceConfig>;
}

export class ConfigService {
  private config: WopalConfig;
  private logger: Logger;
  private settingsPath: string;
  private envLoaded: boolean = false;
  private debug: boolean;

  /**
   * Phase 1: 仅加载 settings.jsonc，不加载 .env
   */
  constructor(debug: boolean = false) {
    this.debug = debug;
    this.logger = new Logger(debug);
    this.settingsPath =
      process.env.WOPAL_SETTINGS_PATH ||
      join(homedir(), ".wopal", "config", "settings.jsonc");
    this.config = loadSettingsFile(this.settingsPath);
  }

  /**
   * Phase 2: 加载环境变量
   * 在 cli.ts 的 preAction hook 中调用，此时已确定目标空间
   */
  public loadEnvForSpace(spacePath?: string): void {
    if (this.envLoaded) return;
    loadEnv(this.debug, spacePath);
    this.envLoaded = true;
  }

  public saveConfig(): void {
    const dir = join(homedir(), ".wopal", "config");
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(
      this.settingsPath,
      JSON.stringify(this.config, null, 2),
      "utf-8",
    );
  }

  // --- 空间查询方法 ---

  public getActiveSpace(): SpaceConfig | undefined {
    const spaceName = this.config.activeSpace;
    if (!spaceName || !this.config.spaces[spaceName]) return undefined;
    return this.config.spaces[spaceName];
  }

  public getActiveSpaceName(): string | undefined {
    return this.config.activeSpace || undefined;
  }

  public getActiveSpacePath(): string | undefined {
    return this.getActiveSpace()?.path;
  }

  /**
   * 获取有效空间（支持 --space 参数覆盖 activeSpace）
   */
  public getEffectiveSpace(spaceOverride?: string): SpaceConfig | undefined {
    const spaceName = spaceOverride || this.config.activeSpace;
    if (!spaceName) return undefined;
    return this.config.spaces[spaceName];
  }

  public getEffectiveSpaceName(spaceOverride?: string): string | undefined {
    return spaceOverride || this.config.activeSpace || undefined;
  }

  public getEffectiveSpacePath(spaceOverride?: string): string | undefined {
    return this.getEffectiveSpace(spaceOverride)?.path;
  }

  public getAllSpaces(): Record<string, SpaceConfig> {
    return this.config.spaces;
  }

  public listSpaces(): { name: string; path: string; active: boolean }[] {
    return Object.entries(this.config.spaces).map(([name, space]) => ({
      name,
      path: space.path,
      active: name === this.config.activeSpace,
    }));
  }

  // --- 空间管理方法 ---

  public addSpace(name: string, spacePath: string): void {
    const expandedPath = spacePath.replace(/^~(?=$|\/|\\)/, homedir());

    if (this.config.spaces[name]) {
      throw new Error(`Space [${name}] already exists.`);
    }

    for (const [existingName, space] of Object.entries(this.config.spaces)) {
      if (space.path === expandedPath) {
        throw new Error(
          `Space already exists at this path (registered as [${existingName}])`,
        );
      }
    }

    this.config.spaces[name] = { path: expandedPath };
    this.config.activeSpace = name;
    this.saveConfig();
  }

  public removeSpace(name: string): void {
    if (!this.config.spaces[name]) {
      throw new Error(`Space [${name}] not found.`);
    }

    delete this.config.spaces[name];

    if (this.config.activeSpace === name) {
      const remainingSpaces = Object.keys(this.config.spaces);
      this.config.activeSpace =
        remainingSpaces.length > 0 ? remainingSpaces[0] : "";
    }

    this.saveConfig();
  }

  public setActiveSpace(name: string): void {
    if (!this.config.spaces[name]) {
      throw new Error(`Space [${name}] not found.`);
    }
    this.config.activeSpace = name;
    this.saveConfig();
  }

  // --- 配置解析方法 ---

  private getWopalHomePath(): string {
    return getWopalHome().replace(/^~(?=$|\/|\\)/, homedir());
  }

  /**
   * 获取全局技能目录
   */
  public getGlobalSkillsDir(): string {
    return resolveConfig("globalSkillsDir", {
      config: this.config,
      wopalHome: this.getWopalHomePath(),
    });
  }

  /**
   * 获取空间技能目录
   */
  public getSkillsDir(spaceOverride?: string): string {
    const spaceConfig = this.getEffectiveSpace(spaceOverride);
    const spacePath = spaceConfig?.path;
    return resolveConfig("skillsDir", {
      config: this.config,
      spaceConfig,
      wopalHome: this.getWopalHomePath(),
      spacePath,
    });
  }

  /**
   * 获取 INBOX 目录
   */
  public getSkillsInboxDir(spaceOverride?: string): string {
    const spaceConfig = this.getEffectiveSpace(spaceOverride);
    const spacePath = spaceConfig?.path;
    return resolveConfig("skillsInboxDir", {
      config: this.config,
      spaceConfig,
      wopalHome: this.getWopalHomePath(),
      spacePath,
    });
  }

  /**
   * 获取 OpenClaw 扫描器目录（固定路径，不支持环境变量覆盖）
   */
  public getOpenclawDir(): string {
    return resolveConfig("openclawIocDir", {
      config: this.config,
      wopalHome: this.getWopalHomePath(),
    });
  }

  /**
   * 获取空间锁文件路径
   */
  public getSpaceLockPath(spaceOverride?: string): string {
    return join(this.getSkillsDir(spaceOverride), ".skill-lock.json");
  }

  /**
   * 获取全局锁文件路径（存放在 $WOPAL_HOME/skills/）
   */
  public getGlobalLockPath(): string {
    return join(this.getGlobalSkillsDir(), ".skill-lock.json");
  }

  /**
   * 获取项目锁文件路径（getSpaceLockPath 的别名，供 LockManager 使用）
   */
  public getProjectLockPath(spaceOverride?: string): string {
    return this.getSpaceLockPath(spaceOverride);
  }
}

let _configInstance: ConfigService | null = null;

export function getConfig(debug: boolean = false): ConfigService {
  if (!_configInstance) {
    _configInstance = new ConfigService(debug);
  }
  return _configInstance;
}

export function resetConfigForTest(): void {
  _configInstance = null;
}

/**
 * 重置配置单例（供 space 命令在写入 settings.jsonc 后刷新使用）
 */
export function invalidateConfigInstance(): void {
  _configInstance = null;
}
