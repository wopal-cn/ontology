import { Check, IOCData, Finding } from '../types';
import { scanDirectory, findPatternInFile } from '../scanner-utils.js';

export const check: Check = {
  id: 'exfil_endpoints',
  name: '数据外泄端点',
  severity: 'critical',
  async run(skillPath: string, iocData: IOCData, whitelist: string[]): Promise<Finding[]> {
    const findings: Finding[] = [];
    
    if (iocData.maliciousDomains.length === 0) {
      return findings;
    }
    
    const domainPattern = new RegExp(iocData.maliciousDomains.join('|'), 'gi');
    
    const fileFindings = await scanDirectory(skillPath, async (filePath, content) => {
      return findPatternInFile(content, domainPattern, filePath);
    });
    
    findings.push(...fileFindings);
    
    return findings;
  },
};

export default check;
