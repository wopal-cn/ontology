import type { IOCData } from "../../../src/scanner/types.js";

export const mockIOCData: IOCData = {
  c2IPs: ["192.168.1.100", "10.0.0.1"],
  maliciousDomains: ["malicious-c2.com", "evil-domain.xyz", "data-collector.xyz"],
  maliciousPublishers: ["evil-publisher"],
  maliciousSkillPatterns: ["evil-pattern"],
  fileHashes: ["abc123def456"],
};

export const mockWhitelist: string[] = [];
