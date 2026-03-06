import { Check, IOCData, Finding } from '../types';
import { scanDirectory, findPatternInFile } from '../scanner-utils.js';

const JS_OBFUSCATION_PATTERNS = [
  /document\.write\s*\(/i,
  /innerHTML\s*=.*<script/i,
  /fromCharCode/i,
  /\\x[0-9a-f]{2}/gi,
  /\\u[0-9a-f]{4}/gi,
];

export const check: Check = {
  id: 'js_obfuscation',
  name: 'JavaScript 混淆',
  severity: 'warning',
  async run(skillPath: string, iocData: IOCData, whitelist: string[]): Promise<Finding[]> {
    const findings: Finding[] = [];
    
    const fileFindings = await scanDirectory(skillPath, async (filePath, content) => {
      const fileFindings: Finding[] = [];
      
      for (const pattern of JS_OBFUSCATION_PATTERNS) {
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
