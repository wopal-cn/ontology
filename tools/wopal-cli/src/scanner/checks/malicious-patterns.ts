import { Check, IOCData, Finding } from '../types';
import { scanDirectory, findPatternInFile } from '../scanner-utils.js';

export const check: Check = {
  id: 'malicious_patterns',
  name: '已知恶意技能模式',
  severity: 'critical',
  async run(skillPath: string, iocData: IOCData, whitelist: string[]): Promise<Finding[]> {
    const findings: Finding[] = [];
    
    if (iocData.maliciousSkillPatterns.length === 0) {
      return findings;
    }
    
    const patternRegex = new RegExp(iocData.maliciousSkillPatterns.join('|'), 'gi');
    
    const fileFindings = await scanDirectory(skillPath, async (filePath, content) => {
      return findPatternInFile(content, patternRegex, filePath);
    });
    
    findings.push(...fileFindings);
    
    return findings;
  },
};

export default check;
