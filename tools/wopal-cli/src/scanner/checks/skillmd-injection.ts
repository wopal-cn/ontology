import * as path from 'path';
import * as fs from 'fs';
import { Check, IOCData, Finding } from '../types';

const SUSPICIOUS_INSTALL_PATTERNS = [
  /curl.*\|\s*bash/i,
  /wget.*\|\s*sh/i,
  /eval.*curl/i,
  /exec.*wget/i,
  /npm.*install.*-g.*http/i,
  /pip.*install.*git\+/i,
];

export const check: Check = {
  id: 'skillmd_injection',
  name: 'SKILL.md 可疑安装指令',
  severity: 'warning',
  async run(skillPath: string, iocData: IOCData, whitelist: string[]): Promise<Finding[]> {
    const findings: Finding[] = [];
    
    const skillmdPath = path.join(skillPath, 'SKILL.md');
    
    if (!fs.existsSync(skillmdPath)) {
      return findings;
    }
    
    try {
      const content = fs.readFileSync(skillmdPath, 'utf-8');
      const lines = content.split('\n');
      
      lines.forEach((line, index) => {
        for (const pattern of SUSPICIOUS_INSTALL_PATTERNS) {
          if (pattern.test(line)) {
            findings.push({
              file: skillmdPath,
              line: index + 1,
              pattern: line.trim(),
              message: `发现可疑安装指令: ${line.trim()}`,
            });
          }
        }
      });
    } catch (error) {
      // Skip files that can't be read
    }
    
    return findings;
  },
};

export default check;
