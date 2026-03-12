import { homedir } from "os";
import { join, isAbsolute, resolve } from "path";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
import stripJsonComments from "strip-json-comments";
import { Logger } from "./logger.js";
import pc from "picocolors";
import { loadEnv } from "./env-loader.js";

export interface SpaceConfig {
  path: string;
  skillsInboxDir?: string;
  skillsIocdbDir?: string;
  skillsDir?: string;
  [key: string]: any;
}

export interface WopalConfig {
  activeSpace: string;
  spaces: Record<string, SpaceConfig>;
}

export class ConfigService {
  private config: WopalConfig;
  private logger: Logger;
  private settingsPath: string;

  constructor(debug: boolean = false) {
    this.logger = new Logger(debug);
    this.settingsPath =
      process.env.WOPAL_SETTINGS_PATH ||
      join(homedir(), ".wopal", "config", "settings.jsonc");
    this.config = this.loadConfig();

    // Check for deprecated configuration items and environment variables
    this.checkDeprecatedConfig();

    // Once settings.jsonc is loaded, we know the active space (if any).
    // Now load environment variables with space priority.
    const spacePath = this.getActiveSpacePath();
    loadEnv(debug, spacePath);
  }

  private loadConfig(): WopalConfig {
    const defaultConfig: WopalConfig = {
      activeSpace: "main",
      spaces: {},
    };

    if (!existsSync(this.settingsPath)) {
      return defaultConfig;
    }

    try {
      const content = readFileSync(this.settingsPath, "utf-8");
      const parsed = JSON.parse(stripJsonComments(content));
      const config = Object.assign(defaultConfig, parsed);

      // Expand ~ in space paths
      for (const space of Object.values(config.spaces) as SpaceConfig[]) {
        if (space.path && space.path.startsWith("~")) {
          space.path = space.path.replace(/^~(?=$|\/|\\)/, homedir());
        }
      }

      return config;
    } catch (e) {
      this.logger.error(
        `Failed to parse config at ${this.settingsPath}, using defaults.`,
        e,
      );
      return defaultConfig;
    }
  }

  private checkDeprecatedConfig(): void {
    const deprecatedEnvVars = [
      { old: "WOPAL_SKILL_INBOX_DIR", new: "WOPAL_SKILLS_INBOX_DIR" },
      { old: "WOPAL_SKILL_IOCDB_DIR", new: "WOPAL_SKILLS_IOCDB_DIR" },
    ];

    for (const { old, new: newVar } of deprecatedEnvVars) {
      if (process.env[old]) {
        console.warn(
          pc.yellow(
            `Warning: Environment variable ${old} is deprecated. Please use ${newVar} instead.`,
          ),
        );
      }
    }

    const deprecatedConfigKeys = [
      { old: "skillInboxDir", new: "skillsInboxDir" },
      { old: "skillIocdbDir", new: "skillsIocdbDir" },
      { old: "skillsInstallDir", new: "skillsDir" },
    ];

    for (const space of Object.values(this.config.spaces)) {
      for (const { old, new: newKey } of deprecatedConfigKeys) {
        if (space[old] !== undefined) {
          console.warn(
            pc.yellow(
              `Warning: Configuration key "${old}" is deprecated. Please use "${newKey}" instead in your settings.jsonc.`,
            ),
          );
        }
      }
    }
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

  /**
   * Interpolate custom `${env:VAR}` syntax and expand `~`
   */
  private resolveValue(
    value: string | undefined,
    spaceDir: string,
  ): string | undefined {
    if (!value) return undefined;

    // 1. Expand standard env overrides first if configured implicitly
    // Wait, the specification (1.3) asks to process `${env:VAR}` pattern.
    let resolved = value.replace(/\$\{env:([\w\d_]+)\}/g, (_, envVar) => {
      return process.env[envVar] || "";
    });

    // 2. Expand homedir
    resolved = resolved.replace(/^~(?=$|\/|\\)/, homedir());

    // 3. Make absolute relative to spaceDir if it's not absolute already
    if (!isAbsolute(resolved) && resolved !== "") {
      resolved = resolve(spaceDir, resolved);
    }

    return resolved;
  }

  public getActiveSpace(): SpaceConfig | undefined {
    const spaceName = this.config.activeSpace;
    if (!spaceName || !this.config.spaces[spaceName]) return undefined;

    return this.config.spaces[spaceName];
  }

  public getActiveSpacePath(): string | undefined {
    return this.getActiveSpace()?.path;
  }

  public addSpace(name: string, path: string): void {
    const expandedPath = resolve(
      process.cwd(),
      path.replace(/^~(?=$|\/|\\)/, homedir()),
    );

    if (this.config.spaces[name]) {
      throw new Error(`Workspace [${name}] already exists.`);
    }

    // Checking if target dir is already registered
    for (const [existingName, space] of Object.entries(this.config.spaces)) {
      if (space.path === expandedPath) {
        throw new Error(
          `Workspace already initialized at this path. (Registered as [${existingName}])`,
        );
      }
    }

    this.config.spaces[name] = {
      path: expandedPath,
    };

    this.config.activeSpace = name;
    this.saveConfig();
  }

  // --- Parameter Accessors ---

  private _hasWarned: Record<string, boolean> = {};

  private warnFallbackOnce(key: string, defaultValue: string) {
    if (!this._hasWarned[key]) {
      // Using picocolors.yellow for explicit warning per design doc
      console.warn(
        pc.yellow(
          `Warning: ${key} configuration missing, using default value: ${defaultValue}`,
        ),
      );
      this._hasWarned[key] = true;
    }
  }

  public getSkillInboxDir(): string {
    const activeSpace = this.getActiveSpace();
    const envVal = process.env.WOPAL_SKILLS_INBOX_DIR;
    let configVal = activeSpace?.skillsInboxDir;
    let spaceDir = activeSpace ? activeSpace.path : process.cwd();

    let targetVal = undefined;
    if (envVal) {
      targetVal = envVal;
    } else if (configVal) {
      targetVal = configVal;
    }

    if (targetVal) {
      return this.resolveValue(targetVal, spaceDir)!;
    }

    const fallbackVal = ".wopal/skills/INBOX";
    this.warnFallbackOnce("WOPAL_SKILLS_INBOX_DIR", fallbackVal);

    return this.resolveValue(fallbackVal, spaceDir)!;
  }

  public getSkillIocdbDir(): string {
    const activeSpace = this.getActiveSpace();
    const envVal = process.env.WOPAL_SKILLS_IOCDB_DIR;
    let configVal = activeSpace?.skillsIocdbDir;
    let spaceDir = activeSpace ? activeSpace.path : process.cwd();

    let targetVal = undefined;
    if (envVal) {
      targetVal = envVal;
    } else if (configVal) {
      targetVal = configVal;
    }

    if (targetVal) {
      return this.resolveValue(targetVal, spaceDir)!;
    }

    const fallbackVal = join(homedir(), ".wopal", "storage", "ioc-db");
    this.warnFallbackOnce("WOPAL_SKILLS_IOCDB_DIR", fallbackVal);

    return fallbackVal;
  }

  public getSkillsInstallDir(): string {
    const activeSpace = this.getActiveSpace();
    const envVal = process.env.WOPAL_SKILLS_DIR;
    let configVal = activeSpace?.skillsDir;
    let spaceDir = activeSpace ? activeSpace.path : process.cwd();

    let targetVal = undefined;
    if (envVal) {
      targetVal = envVal;
    } else if (configVal) {
      targetVal = configVal;
    }

    if (targetVal) {
      return this.resolveValue(targetVal, spaceDir)!;
    }

    const fallbackVal = ".wopal/skills";
    this.warnFallbackOnce("WOPAL_SKILLS_DIR", fallbackVal);

    return this.resolveValue(fallbackVal, spaceDir)!;
  }

  public getProjectLockPath(): string {
    return join(this.getSkillsInstallDir(), ".skill-lock.json");
  }
}

// Singleton export
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
