import * as path from 'path';
import * as fs from 'fs';
import { Logger } from '../utils/logger.js';
import { IOCData } from './types.js';
import { IOC_FILES } from './constants.js';

let logger: Logger;

export function setLogger(l: Logger): void {
  logger = l;
}

let cachedIOCData: IOCData | null = null;

export function getIOCPath(): string {
  const envPath = process.env.WOPAL_SKILL_IOCDB_DIR;
  
  if (envPath) {
    logger.debug(`使用环境变量指定的 IOC 路径: ${envPath}`);
    return envPath;
  }
  
  const defaultPath = path.join(
    process.cwd(),
    'projects/agent-tools/skills/download/openclaw/openclaw-security-monitor/ioc/'
  );
  
  logger.debug(`使用默认 IOC 路径: ${defaultPath}`);
  return defaultPath;
}

export function loadIOCFile(filePath: string): string[] {
  try {
    if (!fs.existsSync(filePath)) {
      logger.warn(`IOC 文件缺失: ${path.basename(filePath)}`);
      return [];
    }
    
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter(line => {
      const trimmed = line.trim();
      return trimmed.length > 0 && !trimmed.startsWith('#');
    });
    
    logger.debug(`加载 IOC 文件 ${path.basename(filePath)}: ${lines.length} 条记录`);
    return lines;
  } catch (error) {
    logger.warn(`加载 IOC 文件失败: ${path.basename(filePath)}`, { error: (error as Error).message });
    return [];
  }
}

export function loadIOCData(): IOCData {
  if (cachedIOCData) {
    logger.debug('使用缓存的 IOC 数据');
    return cachedIOCData;
  }
  
  const iocPath = getIOCPath();
  
  if (!fs.existsSync(iocPath)) {
    logger.error('IOC 数据库未初始化');
    logger.error('建议运行: git submodule update --init');
    return {
      c2IPs: [],
      maliciousDomains: [],
      maliciousPublishers: [],
      maliciousSkillPatterns: [],
      fileHashes: [],
    };
  }
  
  logger.info('加载 IOC 数据库...', { path: iocPath });
  
  const iocData: IOCData = {
    c2IPs: loadIOCFile(path.join(iocPath, IOC_FILES.c2IPs)),
    maliciousDomains: loadIOCFile(path.join(iocPath, IOC_FILES.maliciousDomains)),
    maliciousPublishers: loadIOCFile(path.join(iocPath, IOC_FILES.maliciousPublishers)),
    maliciousSkillPatterns: loadIOCFile(path.join(iocPath, IOC_FILES.maliciousSkillPatterns)),
    fileHashes: loadIOCFile(path.join(iocPath, IOC_FILES.fileHashes)),
  };
  
  const totalRecords = Object.values(iocData).reduce((sum, arr) => sum + arr.length, 0);
  logger.info(`IOC 数据库加载完成: ${totalRecords} 条记录`);
  
  cachedIOCData = iocData;
  return iocData;
}

export function clearIOCCache(): void {
  cachedIOCData = null;
  logger.debug('IOC 数据缓存已清除');
}
