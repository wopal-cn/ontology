export type Severity = 'critical' | 'warning';

export interface Finding {
  file: string;
  line?: number;
  pattern: string;
  message: string;
}

export interface Check {
  id: string;
  name: string;
  severity: Severity;
  run(skillPath: string, iocData: IOCData, whitelist: string[]): Promise<Finding[]>;
}

export interface CheckResult {
  id: string;
  name: string;
  severity: Severity;
  status: 'pass' | 'fail';
  findings: Finding[];
}

export interface ScanResult {
  skillName: string;
  scanTime: string;
  riskScore: number;
  status: 'pass' | 'fail';
  checks: Record<string, CheckResult>;
  summary: {
    critical: number;
    warning: number;
    passed: number;
  };
}

export interface IOCData {
  c2IPs: string[];
  maliciousDomains: string[];
  maliciousPublishers: string[];
  maliciousSkillPatterns: string[];
  fileHashes: string[];
}
