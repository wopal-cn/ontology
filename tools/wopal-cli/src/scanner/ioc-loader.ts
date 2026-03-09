import * as path from "path";
import * as fs from "fs";
import { Logger } from "../utils/logger.js";
import { IOCData } from "./types.js";
import { IOC_FILES } from "./constants.js";
import { getConfig } from "../utils/config.js";

let logger: Logger;

export function setLogger(l: Logger): void {
  logger = l;
}

let cachedIOCData: IOCData | null = null;

export function getIOCPath(): string {
  const pathVal = getConfig().getSkillIocdbDir();
  logger.debug(`使用 IOC 路径: ${pathVal}`);
  return pathVal;
}

export function loadIOCFile(filePath: string): string[] {
  try {
    if (!fs.existsSync(filePath)) {
      logger.warn(`IOC 文件缺失: ${path.basename(filePath)}`);
      return [];
    }

    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n").filter((line) => {
      const trimmed = line.trim();
      return trimmed.length > 0 && !trimmed.startsWith("#");
    });

    logger.debug(
      `加载 IOC 文件 ${path.basename(filePath)}: ${lines.length} 条记录`,
    );
    return lines;
  } catch (error) {
    logger.warn(`加载 IOC 文件失败: ${path.basename(filePath)}`, {
      error: (error as Error).message,
    });
    return [];
  }
}

export function loadIOCData(): IOCData {
  if (cachedIOCData) {
    logger.debug("使用缓存的 IOC 数据");
    return cachedIOCData;
  }

  const iocPath = getIOCPath();

  if (!fs.existsSync(iocPath)) {
    logger.error("IOC 数据库未初始化");
    logger.error("建议运行: git submodule update --init");
    return {
      c2IPs: [],
      maliciousDomains: [],
      maliciousPublishers: [],
      maliciousSkillPatterns: [],
      fileHashes: [],
    };
  }

  logger.info("加载 IOC 数据库...", { path: iocPath });

  const iocData: IOCData = {
    c2IPs: loadIOCFile(path.join(iocPath, IOC_FILES.c2IPs)),
    maliciousDomains: loadIOCFile(
      path.join(iocPath, IOC_FILES.maliciousDomains),
    ),
    maliciousPublishers: loadIOCFile(
      path.join(iocPath, IOC_FILES.maliciousPublishers),
    ),
    maliciousSkillPatterns: loadIOCFile(
      path.join(iocPath, IOC_FILES.maliciousSkillPatterns),
    ),
    fileHashes: loadIOCFile(path.join(iocPath, IOC_FILES.fileHashes)),
  };

  const totalRecords = Object.values(iocData).reduce(
    (sum, arr) => sum + arr.length,
    0,
  );
  logger.info(`IOC 数据库加载完成: ${totalRecords} 条记录`);

  cachedIOCData = iocData;
  return iocData;
}

export function clearIOCCache(): void {
  cachedIOCData = null;
  logger.debug("IOC 数据缓存已清除");
}
