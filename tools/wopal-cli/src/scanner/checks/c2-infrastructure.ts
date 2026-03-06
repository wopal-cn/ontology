import { Check, IOCData, Finding } from '../types';
import { scanDirectory, findPatternInFile } from '../scanner-utils.js';

export const check: Check = {
  id: 'c2_infrastructure',
  name: '已知 C2 IP 地址检查',
  severity: 'critical',
  async run(skillPath: string, iocData: IOCData, whitelist: string[]): Promise<Finding[]> {
    const findings: Finding[] = [];
    
    const allPatterns = [...iocData.c2IPs, ...iocData.maliciousDomains];
    
    if (allPatterns.length === 0) {
      return findings;
    }
    
    const ipPattern = new RegExp(allPatterns.join('|'), 'gi');
    
    const fileFindings = await scanDirectory(skillPath, async (filePath, content) => {
      return findPatternInFile(content, ipPattern, filePath);
    });
    
    findings.push(...fileFindings);
    
    return findings;
  },
};

export default check;
