import { Check, IOCData, Finding } from "../types";
import { scanDirectory, findPatternInFile } from "../scanner-utils.js";

const BINARY_DOWNLOAD_PATTERNS = [
  /curl.*\.exe/i,
  /wget.*\.exe/i,
  /curl.*\.bin/i,
  /wget.*\.bin/i,
  /download.*\.exe.*exec/i,
  /download.*\.sh.*exec/i,
];

export const check: Check = {
  id: "binary_download",
  name: "外部二进制下载",
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

        for (const pattern of BINARY_DOWNLOAD_PATTERNS) {
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
