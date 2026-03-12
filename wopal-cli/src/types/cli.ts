export interface JsonOutput {
  success: boolean;
  data?: unknown;
  error?: {
    code: string;
    message: string;
    suggestion?: string;
  };
}

export interface SkillListItem {
  name: string;
  description?: string;
  status: "downloaded" | "installed";
  path?: string;
  source?: string;
}

export interface InboxSkillItem {
  name: string;
  description?: string;
  source: string;
  downloadedAt: string;
}

export interface ScanResult {
  skillName: string;
  status: "critical" | "warning" | "passed";
  issues: ScanIssue[];
  riskScore: number;
}

export interface ScanIssue {
  severity: "critical" | "warning";
  category: string;
  description: string;
  file?: string;
  line?: number;
}

export interface CheckResult {
  skillName: string;
  hasUpdate: boolean;
  currentVersion?: string;
  latestVersion?: string;
  source?: string;
}

export type OutputFormat = "text" | "json";
