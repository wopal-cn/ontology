import * as path from 'path';
import * as fs from 'fs';
import { Check, IOCData, Finding } from '../types';

const MCP_PATTERNS = [
  /systemPrompt.*http/i,
  /instructions.*curl/i,
  /commands.*wget/i,
  /prompt.*execute/i,
  /prompt.*download/i,
];

export const check: Check = {
  id: 'mcp_security',
  name: 'MCP 配置提示注入',
  severity: 'critical',
  async run(skillPath: string, iocData: IOCData, whitelist: string[]): Promise<Finding[]> {
    const findings: Finding[] = [];
    
    const mcpConfigPath = path.join(skillPath, 'mcp-config.json');
    
    if (!fs.existsSync(mcpConfigPath)) {
      return findings;
    }
    
    try {
      const content = fs.readFileSync(mcpConfigPath, 'utf-8');
      const lines = content.split('\n');
      
      lines.forEach((line, index) => {
        for (const pattern of MCP_PATTERNS) {
          if (pattern.test(line)) {
            findings.push({
              file: mcpConfigPath,
              line: index + 1,
              pattern: line.trim(),
              message: `发现可疑 MCP 配置: ${line.trim()}`,
            });
          }
        }
      });
    } catch (error) {
      // Skip files that can't be read
    }
    
    return findings;
  },
};

export default check;
