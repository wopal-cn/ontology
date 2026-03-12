import * as path from "path";
import * as fs from "fs";
import { Logger } from "../lib/logger.js";
import { Finding } from "./types.js";
import { IOC_FILES } from "./constants.js";
import { getIOCPath } from "./ioc-loader.js";

let logger: Logger;

export function setLogger(l: Logger): void {
  logger = l;
}

export function loadWhitelist(): string[] {
  const iocPath = getIOCPath();
  const whitelistPath = path.join(iocPath, IOC_FILES.whitelistPatterns);

  if (!fs.existsSync(whitelistPath)) {
    logger.debug("白名单文件不存在，使用空白名单");
    return [];
  }

  try {
    const content = fs.readFileSync(whitelistPath, "utf-8");
    const patterns = content
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#"));

    logger.debug(`加载白名单: ${patterns.length} 条模式`);
    return patterns;
  } catch (error) {
    logger.warn("加载白名单失败", { error: (error as Error).message });
    return [];
  }
}

export function isWhitelisted(pattern: string, whitelist: string[]): boolean {
  return whitelist.some((whitelistPattern) => {
    if (whitelistPattern.startsWith("/") && whitelistPattern.endsWith("/")) {
      try {
        const regex = new RegExp(whitelistPattern.slice(1, -1));
        return regex.test(pattern);
      } catch (error) {
        logger.warn(`白名单正则表达式无效: ${whitelistPattern}`);
        return false;
      }
    } else if (whitelistPattern.includes("*")) {
      try {
        const regexPattern = "^" + whitelistPattern.replace(/\*/g, ".*") + "$";
        const regex = new RegExp(regexPattern);
        return regex.test(pattern);
      } catch (error) {
        logger.warn(`白名单通配符模式无效: ${whitelistPattern}`);
        return false;
      }
    } else {
      return pattern === whitelistPattern;
    }
  });
}

export function filterWhitelistedFindings(
  findings: Finding[],
  whitelist: string[],
): Finding[] {
  const filtered = findings.filter(
    (finding) => !isWhitelisted(finding.pattern, whitelist),
  );

  if (findings.length !== filtered.length) {
    logger.debug(
      `白名单过滤: ${findings.length} -> ${filtered.length} (移除 ${findings.length - filtered.length} 个误报)`,
    );
  }

  return filtered;
}
