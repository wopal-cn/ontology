import { Check, IOCData, Finding } from "../types";
import { scanDirectory, findPatternInFile } from "../scanner-utils.js";

const SENSITIVE_FILE_PATTERNS = [
  /\.env/i,
  /credentials\.json/i,
  /secrets?\//i,
  /api_keys?\.txt/i,
  /private.*key/i,
  /access.*token/i,
];

export const check: Check = {
  id: "env_leakage",
  name: "访问敏感文件",
  severity: "warning",
  async run(
    skillPath: string,
    iocData: IOCData,
    whitelist: string[],
  ): Promise<Finding[]> {
    const findings: Finding[] = [];

    const fileFindings = await scanDirectory(
      skillPath,
      async (filePath, content) => {
        const fileFindings: Finding[] = [];

        for (const pattern of SENSITIVE_FILE_PATTERNS) {
          const patternFindings = findPatternInFile(content, pattern, filePath);
          fileFindings.push(...patternFindings);
        }

        return fileFindings;
      },
    );

    findings.push(...fileFindings);

    return findings;
  },
};

export default check;
