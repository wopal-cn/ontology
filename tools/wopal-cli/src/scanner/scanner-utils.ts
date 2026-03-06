import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { Logger } from '../utils/logger.js';
import { Finding } from './types.js';
import { MAX_FILE_SIZE, SKIP_DIRECTORIES, SCANABLE_EXTENSIONS } from './constants.js';

let logger: Logger;

export function setLogger(l: Logger): void {
  logger = l;
}

export async function scanDirectory(
  dirPath: string,
  onFile: (filePath: string, content: string) => Promise<Finding[]>,
  skipDirectories: string[] = SKIP_DIRECTORIES
): Promise<Finding[]> {
  const findings: Finding[] = [];
  
  async function walk(currentPath: string): Promise<void> {
    const entries = fs.readdirSync(currentPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      
      if (entry.isDirectory()) {
        if (skipDirectories.includes(entry.name)) {
          logger.debug(`跳过目录: ${entry.name}`);
          continue;
        }
        await walk(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (!SCANABLE_EXTENSIONS.includes(ext)) {
          continue;
        }
        
        try {
          const stats = fs.statSync(fullPath);
          if (stats.size > MAX_FILE_SIZE) {
            logger.debug(`跳过大文件: ${entry.name} (${stats.size} bytes)`);
            continue;
          }
          
          const content = fs.readFileSync(fullPath, 'utf-8');
          const fileFindings = await onFile(fullPath, content);
          findings.push(...fileFindings);
        } catch (error) {
          logger.warn(`扫描文件失败: ${fullPath}`, { error: (error as Error).message });
        }
      }
    }
  }
  
  await walk(dirPath);
  return findings;
}

export function calculateFileHash(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

export function findPatternInFile(content: string, pattern: RegExp | string, filePath: string): Finding[] {
  const findings: Finding[] = [];
  const lines = content.split('\n');
  
  const regex = typeof pattern === 'string' ? new RegExp(pattern, 'gi') : pattern;
  
  lines.forEach((line, index) => {
    const matches = line.match(regex);
    if (matches) {
      matches.forEach(match => {
        findings.push({
          file: filePath,
          line: index + 1,
          pattern: match,
          message: `发现可疑模式: ${match}`,
        });
      });
    }
  });
  
  return findings;
}
