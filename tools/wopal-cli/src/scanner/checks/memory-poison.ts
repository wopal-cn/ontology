import { Check, IOCData, Finding } from '../types';
import { scanDirectory, findPatternInFile } from '../scanner-utils.js';

const MEMORY_PATTERNS = [
  /MEMORY\.md/i,
  /memory\//i,
  /AGENTS\.md/i,
  /\.agents\//i,
  /writeFile.*MEMORY/i,
  /appendFile.*MEMORY/i,
];

export const check: Check = {
  id: 'memory_poison',
  name: '修改内存文件',
  severity: 'critical',
  async run(skillPath: string, iocData: IOCData, whitelist: string[]): Promise<Finding[]> {
    const findings: Finding[] = [];
    
    const fileFindings = await scanDirectory(skillPath, async (filePath, content) => {
      const fileFindings: Finding[] = [];
      
      for (const pattern of MEMORY_PATTERNS) {
        const patternFindings = findPatternInFile(content, pattern, filePath);
        fileFindings.push(...patternFindings);
      }
      
      return fileFindings;
    });
    
    findings.push(...fileFindings);
    
    return findings;
  },
};

export default check;
