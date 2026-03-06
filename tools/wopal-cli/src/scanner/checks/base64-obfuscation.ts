import { Check, IOCData, Finding } from '../types';
import { scanDirectory, findPatternInFile } from '../scanner-utils.js';

const BASE64_PATTERNS = [
  /eval\s*\(\s*atob\s*\(/i,
  /eval\s*\(\s*Buffer\.from\s*\(/i,
  /Function\s*\(\s*atob\s*\(/i,
  /atob\s*\(['"][A-Za-z0-9+/=]{50,}['"]\)/,
];

export const check: Check = {
  id: 'base64_obfuscation',
  name: 'Base64 混淆模式',
  severity: 'warning',
  async run(skillPath: string, iocData: IOCData, whitelist: string[]): Promise<Finding[]> {
    const findings: Finding[] = [];
    
    const fileFindings = await scanDirectory(skillPath, async (filePath, content) => {
      const fileFindings: Finding[] = [];
      
      for (const pattern of BASE64_PATTERNS) {
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
