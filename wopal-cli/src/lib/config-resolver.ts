import { homedir } from "os";
import { isAbsolute, resolve } from "path";
import { existsSync, readFileSync } from "fs";
import stripJsonComments from "strip-json-comments";
import type { SpaceConfig, WopalConfig } from "./config.js";
import {
  CONFIG_REGISTRY,
  type ConfigProperty,
  type ConfigContext,
} from "./config-registry.js";

/**
 * 解析路径值
 *
 * 处理三种路径格式：
 * 1. 绝对路径：直接返回
 * 2. 带 ~ 路径：展开为 home 目录
 * 3. 相对路径：根据 relativeTo 决定基准目录
 */
function resolvePath(
  value: string,
  ctx: ConfigContext,
  prop: ConfigProperty,
): string {
  let result = value;

  // 展开 ~ 为 home 目录
  if (result.startsWith("~")) {
    result = result.replace(/^~(?=$|\/|\\)/, homedir());
  }

  // 绝对路径直接返回
  if (isAbsolute(result)) {
    return result;
  }

  // 相对路径：根据 relativeTo 决定基准目录
  if (prop.relativeTo === "spacePath" && ctx.spacePath) {
    return resolve(ctx.spacePath, result);
  }

  return resolve(ctx.wopalHome, result);
}

/**
 * 从配置文件获取值
 */
function getConfigFromFile(
  prop: ConfigProperty,
  config: WopalConfig,
  spaceConfig?: SpaceConfig,
): string | undefined {
  if (prop.scope === "space" && spaceConfig && prop.configKey) {
    return spaceConfig[prop.configKey as keyof SpaceConfig] as
      | string
      | undefined;
  }
  if (prop.scope === "global" && prop.configKey) {
    return config[prop.configKey as keyof WopalConfig] as string | undefined;
  }
  return undefined;
}

/**
 * 解析配置项
 *
 * 优先级：环境变量 > settings.jsonc 配置 > 默认值
 */
export function resolveConfig(
  name: string,
  options: {
    config: WopalConfig;
    spaceConfig?: SpaceConfig;
    wopalHome: string;
    spacePath?: string;
  },
): string {
  const prop = CONFIG_REGISTRY[name];
  if (!prop) {
    throw new Error(`Unknown config: ${name}`);
  }

  const ctx: ConfigContext = {
    wopalHome: options.wopalHome,
    spacePath: options.spacePath,
  };

  // 1. 环境变量（最高优先级）
  if (prop.envVar && process.env[prop.envVar]) {
    return resolvePath(process.env[prop.envVar]!, ctx, prop);
  }

  // 2. 配置文件
  const configVal = getConfigFromFile(
    prop,
    options.config,
    options.spaceConfig,
  );
  if (configVal) {
    return resolvePath(configVal, ctx, prop);
  }

  // 3. 默认值
  const defaultVal =
    typeof prop.default === "function" ? prop.default(ctx) : prop.default;
  return resolvePath(defaultVal, ctx, prop);
}

/**
 * 加载并解析 settings.jsonc 文件
 */
export function loadSettingsFile(settingsPath: string): {
  activeSpace: string;
  spaces: Record<string, SpaceConfig>;
  globalSkillsDir?: string;
} {
  const defaultConfig = {
    activeSpace: "main",
    spaces: {} as Record<string, SpaceConfig>,
  };

  if (!existsSync(settingsPath)) {
    return defaultConfig;
  }

  try {
    const content = readFileSync(settingsPath, "utf-8");
    const parsed = JSON.parse(stripJsonComments(content));
    const config = { ...defaultConfig, ...parsed };

    // 展开 space path 中的 ~
    for (const space of Object.values(config.spaces) as SpaceConfig[]) {
      if (space.path && space.path.startsWith("~")) {
        space.path = space.path.replace(/^~(?=$|\/|\\)/, homedir());
      }
    }

    return config;
  } catch {
    return defaultConfig;
  }
}
