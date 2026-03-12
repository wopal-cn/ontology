import * as path from "path";
import { Check, IOCData, Finding } from "../types";
import { scanDirectory, calculateFileHash } from "../scanner-utils.js";

export const check: Check = {
  id: "file_hashes",
  name: "已知恶意文件哈希",
  severity: "critical",
  async run(
    skillPath: string,
    iocData: IOCData,
    whitelist: string[],
  ): Promise<Finding[]> {
    const findings: Finding[] = [];

    if (iocData.fileHashes.length === 0) {
      return findings;
    }

    const maliciousHashes = new Set(
      iocData.fileHashes.map((h) => h.toLowerCase()),
    );

    await scanDirectory(skillPath, async (filePath, content) => {
      try {
        const hash = calculateFileHash(filePath);

        if (maliciousHashes.has(hash.toLowerCase())) {
          findings.push({
            file: filePath,
            pattern: hash,
            message: `发现已知恶意文件哈希: ${hash}`,
          });
        }
      } catch (error) {
        // Skip files that can't be hashed
      }

      return [];
    });

    return findings;
  },
};

export default check;
