import { Check, IOCData, Finding } from '../types';
import { scanDirectory, findPatternInFile } from '../scanner-utils.js';

const PERSISTENCE_PATTERNS = [
  /crontab.*-e/i,
  /launchctl.*load/i,
  /systemctl.*enable/i,
  /registry.*run/i,
  /auto.*start/i,
  /startup.*script/i,
];

export const check: Check = {
  id: 'persistence',
  name: '持久化机制',
  severity: 'warning',
  async run(skillPath: string, iocData: IOCData, whitelist: string[]): Promise<Finding[]> {
    const findings: Finding[] = [];
    
    const fileFindings = await scanDirectory(skillPath, async (filePath, content) => {
      const fileFindings: Finding[] = [];
      
      for (const pattern of PERSISTENCE_PATTERNS) {
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
