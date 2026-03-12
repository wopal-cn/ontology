import { Check, IOCData, Finding } from "../types";
import { scanDirectory, findPatternInFile } from "../scanner-utils.js";

const REVERSE_SHELL_PATTERNS = [
  /bash\s+-i/i,
  /nc\s+-e/i,
  /ncat\s+-e/i,
  /python\s+-c.*socket/i,
  /perl\s+-e.*socket/i,
  /ruby\s+-e.*socket/i,
  /\/dev\/tcp\//i,
  /\/dev\/udp\//i,
];

export const check: Check = {
  id: "reverse_shell",
  name: "反向 Shell 模式",
  severity: "critical",
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

        for (const pattern of REVERSE_SHELL_PATTERNS) {
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
