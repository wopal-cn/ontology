import { Check, IOCData, Finding } from '../types';
import { scanDirectory, findPatternInFile } from '../scanner-utils.js';

const CRYPTO_PATTERNS = [
  /0x[a-fA-F0-9]{40}/,
  /bitcoin/i,
  /ethereum/i,
  /wallet/i,
  /private.*key/i,
  /mnemonic/i,
  /seed.*phrase/i,
];

export const check: Check = {
  id: 'crypto_wallet',
  name: '加密钱包相关模式',
  severity: 'warning',
  async run(skillPath: string, iocData: IOCData, whitelist: string[]): Promise<Finding[]> {
    const findings: Finding[] = [];
    
    const fileFindings = await scanDirectory(skillPath, async (filePath, content) => {
      const fileFindings: Finding[] = [];
      
      for (const pattern of CRYPTO_PATTERNS) {
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
