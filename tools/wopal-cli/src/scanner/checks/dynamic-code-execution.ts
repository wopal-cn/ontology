import { Check, IOCData, Finding } from '../types';
import { scanDirectory, findPatternInFile } from '../scanner-utils.js';

const DYNAMIC_EXEC_PATTERNS = [
  /eval\s*\(/i,
  /exec\s*\(/i,
  /Function\s*\(/i,
  /new\s+Function\s*\(/i,
  /setTimeout\s*\(\s*['"]/i,
  /setInterval\s*\(\s*['"]/i,
];

export const check: Check = {
  id: 'dynamic_code_execution',
  name: '动态代码执行',
  severity: 'warning',
  async run(skillPath: string, iocData: IOCData, whitelist: string[]): Promise<Finding[]> {
    const findings: Finding[] = [];
    
    const fileFindings = await scanDirectory(skillPath, async (filePath, content) => {
      const fileFindings: Finding[] = [];
      
      for (const pattern of DYNAMIC_EXEC_PATTERNS) {
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
