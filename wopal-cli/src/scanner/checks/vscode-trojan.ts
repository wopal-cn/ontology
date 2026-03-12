import * as path from "path";
import * as fs from "fs";
import { Check, IOCData, Finding } from "../types";

const SUSPICIOUS_PATTERNS = [
  /<Installer>/i,
  /<Commands>/i,
  /execute.*command/i,
  /run.*script/i,
  /postInstall.*curl/i,
  /postInstall.*wget/i,
];

export const check: Check = {
  id: "vscode_trojan",
  name: "可疑 VS Code 扩展",
  severity: "critical",
  async run(
    skillPath: string,
    iocData: IOCData,
    whitelist: string[],
  ): Promise<Finding[]> {
    const findings: Finding[] = [];

    const vscodeFiles = [
      path.join(skillPath, "extension.vsixmanifest"),
      path.join(skillPath, "package.json"),
    ];

    for (const filePath of vscodeFiles) {
      if (!fs.existsSync(filePath)) {
        continue;
      }

      try {
        const content = fs.readFileSync(filePath, "utf-8");
        const lines = content.split("\n");

        lines.forEach((line, index) => {
          for (const pattern of SUSPICIOUS_PATTERNS) {
            if (pattern.test(line)) {
              findings.push({
                file: filePath,
                line: index + 1,
                pattern: line.trim(),
                message: `发现可疑 VS Code 扩展模式: ${line.trim()}`,
              });
            }
          }
        });
      } catch (error) {
        // Skip files that can't be read
      }
    }

    return findings;
  },
};

export default check;
