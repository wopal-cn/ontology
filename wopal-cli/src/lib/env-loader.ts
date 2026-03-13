import { existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import dotenv from "dotenv";

function expandHomeDir(path: string): string {
  return path.replace(/^~(?=$|\/|\\)/, homedir());
}

function expandEnvVarPaths(): void {
  for (const key of Object.keys(process.env)) {
    const value = process.env[key];
    if (value && value.includes("~")) {
      process.env[key] = expandHomeDir(value);
    }
  }
}

/**
 * 加载环境变量
 *
 * 加载顺序（后加载的覆盖先加载的）：
 * 1. $WOPAL_HOME/.env（全局，低优先级）
 * 2. <targetSpacePath>/.env（空间级，高优先级，使用 override 确保覆盖）
 *
 * 注意：不加载 process.cwd()/.env，避免配置污染
 *
 * @param debug - 调试模式
 * @param targetSpacePath - 目标空间路径，undefined 时仅加载全局
 */
export function loadEnv(
  debug: boolean = false,
  targetSpacePath?: string,
): void {
  // 1. 获取 WOPAL_HOME（可能已被系统环境变量设置）
  const wopalHome = process.env.WOPAL_HOME || join(homedir(), ".wopal");

  // 2. 加载全局 .env（低优先级，先加载）
  const globalEnvPath = join(wopalHome, ".env");
  if (existsSync(globalEnvPath)) {
    const result = dotenv.config({ path: globalEnvPath });
    if (result.error && debug) {
      console.error(`Failed to load global .env: ${result.error}`);
    }
  }

  // 3. 加载目标空间的 .env（高优先级，后加载，使用 override 覆盖全局）
  if (targetSpacePath) {
    const spaceEnvPath = join(targetSpacePath, ".env");
    if (existsSync(spaceEnvPath)) {
      const result = dotenv.config({ path: spaceEnvPath, override: true });
      if (result.error && debug) {
        console.error(`Failed to load space .env: ${result.error}`);
      }
    }
  }

  // 4. 展开所有环境变量中的 ~ 路径
  expandEnvVarPaths();
}

/**
 * @deprecated 请使用 loadEnv()，此函数仅为向后兼容保留
 */
export function loadEnvForSpace(
  debug: boolean = false,
  targetSpacePath?: string,
): void {
  loadEnv(debug, targetSpacePath);
}
