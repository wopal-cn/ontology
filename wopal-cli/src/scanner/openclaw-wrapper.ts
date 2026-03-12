import { spawn } from "child_process";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { Logger } from "../lib/logger.js";
import { getOpenclawDir } from "./openclaw-updater.js";
import { ScanResult, CheckResult } from "./types.js";

let logger: Logger;

export function setLogger(l: Logger): void {
  logger = l;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const WRAPPER_SCRIPT = join(__dirname, "wopal-scan-wrapper.sh");

export const SCAN_TIMEOUT_SECS = 180;

export interface ParsedSummary {
  critical: number;
  warnings: number;
  clean: number;
  totalChecks: number;
}

export interface OpenclawScanOutput {
  rawOutput: string;
  exitCode: number;
  summary: ParsedSummary;
}

export async function runOpenclawScan(
  inboxPath: string,
  timeoutSecs: number = SCAN_TIMEOUT_SECS,
): Promise<OpenclawScanOutput> {
  const openclawDir = getOpenclawDir();

  logger.debug(`Running openclaw scan`, {
    inbox: inboxPath,
    openclaw: openclawDir,
    timeout: timeoutSecs,
  });

  return new Promise((resolve, reject) => {
    const child = spawn(
      "bash",
      [WRAPPER_SCRIPT, inboxPath, openclawDir, String(timeoutSecs)],
      {
        cwd: inboxPath,
        env: { ...process.env },
      },
    );

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      const exitCode = code ?? 3;
      const rawOutput = stdout + stderr;

      logger.debug(`Openclaw scan completed`, {
        exitCode,
        outputLength: rawOutput.length,
      });

      if (exitCode === 3) {
        reject(new Error(`Scan failed: ${rawOutput}`));
        return;
      }

      const summary = parseSummary(rawOutput);
      resolve({ rawOutput, exitCode, summary });
    });

    child.on("error", (error) => {
      reject(new Error(`Failed to run scan: ${error.message}`));
    });
  });
}

const SYSTEM_PATTERNS = [
  /^CRITICAL:.*OpenClaw v\d+/,
  /^CRITICAL:.*PATH hijack:/,
  /^WARNING:.*OpenClaw v\d+/,
  /^WARNING:.*No tools in deny list/,
  /^WARNING:.*OpenClaw home dir has permissions/,
  /^WARNING:.*Gateway log dir/,
  /^WARNING:.*No gateway auth token/,
  /^WARNING:.*WebSocket header redaction/,
  /^WARNING:.*Skill files changed since last scan/,
];

function isSystemLevelWarning(line: string): boolean {
  return SYSTEM_PATTERNS.some((pattern) => pattern.test(line));
}

function parseSummary(output: string): ParsedSummary {
  let critical = 0;
  let warnings = 0;
  let clean = 0;
  let totalChecks = 0;

  const lines = output.split("\n");

  for (const line of lines) {
    if (line.startsWith("CRITICAL:")) {
      if (!isSystemLevelWarning(line)) {
        critical++;
        logger.debug(`Found CRITICAL: ${line}`);
      }
    } else if (line.startsWith("WARNING:")) {
      if (!isSystemLevelWarning(line)) {
        warnings++;
        logger.debug(`Found WARNING: ${line}`);
      }
    } else if (line.startsWith("CLEAN:")) {
      clean++;
    }

    const match = line.match(/^\[(\d+)\/(\d+)\]/);
    if (match) {
      totalChecks = Math.max(totalChecks, parseInt(match[2], 10));
    }
  }

  if (totalChecks === 0) {
    totalChecks = 51;
  }

  logger.debug(
    `Summary: critical=${critical}, warnings=${warnings}, clean=${clean}, totalChecks=${totalChecks}`,
  );

  return { critical, warnings, clean, totalChecks };
}

export function convertToScanResult(
  skillName: string,
  output: OpenclawScanOutput,
): ScanResult {
  const { summary, exitCode, rawOutput } = output;

  const checks: Record<string, CheckResult> = {};
  const lines = rawOutput.split("\n");

  let currentCheckId = "";
  let currentCheckName = "";
  let checkCounter = 0;

  for (const line of lines) {
    const checkMatch = line.match(/^\[(\d+)\/\d+\] (.+)/);
    if (checkMatch) {
      if (currentCheckId && currentCheckName) {
        checks[currentCheckId] = {
          id: currentCheckId,
          name: currentCheckName,
          severity: "warning",
          status: "pass",
          findings: [],
        };
      }

      checkCounter++;
      currentCheckId = `openclaw_check_${checkCounter.toString().padStart(2, "0")}`;
      currentCheckName = checkMatch[2];
    }

    if (line.startsWith("CRITICAL:") && currentCheckId) {
      const message = line.substring("CRITICAL:".length).trim();
      checks[currentCheckId] = {
        id: currentCheckId,
        name: currentCheckName,
        severity: "critical",
        status: "fail",
        findings: [
          {
            file: skillName,
            pattern: message,
            line: undefined,
            message: message,
          },
        ],
      };
    } else if (line.startsWith("WARNING:") && currentCheckId) {
      const existing = checks[currentCheckId];
      if (existing && existing.status === "fail") {
        continue;
      }

      const message = line.substring("WARNING:".length).trim();
      checks[currentCheckId] = {
        id: currentCheckId,
        name: currentCheckName,
        severity: "warning",
        status: "fail",
        findings: [
          {
            file: skillName,
            pattern: message,
            line: undefined,
            message: message,
          },
        ],
      };
    } else if (line.startsWith("CLEAN:") && currentCheckId) {
      if (!checks[currentCheckId]) {
        checks[currentCheckId] = {
          id: currentCheckId,
          name: currentCheckName,
          severity: "warning",
          status: "pass",
          findings: [],
        };
      }
    }
  }

  if (currentCheckId && currentCheckName && !checks[currentCheckId]) {
    checks[currentCheckId] = {
      id: currentCheckId,
      name: currentCheckName,
      severity: "warning",
      status: "pass",
      findings: [],
    };
  }

  const riskScore = calculateRiskScore(summary);

  let status: "pass" | "fail";
  if (exitCode === 0) {
    status = "pass";
  } else {
    status = riskScore >= 25 ? "fail" : "pass";
  }

  return {
    skillName,
    scanTime: new Date().toISOString(),
    riskScore,
    status,
    checks,
    summary: {
      critical: summary.critical,
      warning: summary.warnings,
      passed: summary.clean,
    },
  };
}

function calculateRiskScore(summary: ParsedSummary): number {
  const criticalWeight = 25;
  const warningWeight = 10;

  const score =
    summary.critical * criticalWeight + summary.warnings * warningWeight;
  return Math.min(score, 100);
}
