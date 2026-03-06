import { Check, IOCData, Finding } from '../types';
import { scanDirectory, findPatternInFile } from '../scanner-utils.js';

const CURL_PIPE_PATTERNS = [
  /curl.*\|\s*bash/i,
  /curl.*\|\s*sh/i,
  /wget.*\|\s*bash/i,
  /wget.*\|\s*sh/i,
  /curl.*\|\s*sudo/i,
  /wget.*\|\s*sudo/i,
];

export const check: Check = {
  id: 'curl_pipe',
  name: 'Curl-Pipe 攻击模式',
  severity: 'warning',
  async run(skillPath: string, iocData: IOCData, whitelist: string[]): Promise<Finding[]> {
    const findings: Finding[] = [];
    
    const fileFindings = await scanDirectory(skillPath, async (filePath, content) => {
      const fileFindings: Finding[] = [];
      
      for (const pattern of CURL_PIPE_PATTERNS) {
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
