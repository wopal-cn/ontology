import * as path from "path";
import * as fs from "fs";
import type {
  SubCommandDefinition,
  ProgramContext,
} from "../../program/types.js";
import type { ScanResult } from "../../scanner/types.js";
import { getInboxDir } from "../../lib/inbox-utils.js";
import {
  ensureOpenclawRepo,
  validateOpenclawRepo,
} from "../../scanner/openclaw-updater.js";
import {
  runOpenclawScan,
  convertToScanResult,
} from "../../scanner/openclaw-wrapper.js";
import { handleCommandError } from "../../lib/error-utils.js";

export interface ScanCommandOptions {
  json?: boolean;
  all?: boolean;
  output?: string;
  noUpdate?: boolean;
}

async function scanCommand(
  skillName: string | undefined,
  options: ScanCommandOptions,
  context: ProgramContext,
): Promise<number> {
  const { output, debug } = context;
  try {
    if (!options.noUpdate) {
      if (debug) {
        output.print("Ensuring OpenClaw scanner is up to date...");
      }
      await ensureOpenclawRepo(false);
    }

    const validation = validateOpenclawRepo();
    if (!validation.valid) {
      output.error(`Scanner validation failed: ${validation.error}`);
      output.error(
        "Please run 'wopal skills update-scanner' to download the scanner",
      );
      return 2;
    }

    if (options.all) {
      return await scanAllSkills(options, context);
    } else if (skillName) {
      return await scanSingleSkill(skillName, options, context);
    } else {
      output.error(
        "Missing required argument: skill-name",
        "Use 'wopal skills scan <skill-name>' to scan a single skill\nUse 'wopal skills scan --all' to scan all skills in INBOX",
      );
      return 2;
    }
  } catch (error) {
    output.error("Scan failed", (error as Error).message);
    return 2;
  }
}

async function scanSingleSkill(
  skillName: string,
  options: ScanCommandOptions,
  context: ProgramContext,
): Promise<number> {
  const { output } = context;
  const inboxPath = getInboxDir();
  const skillPath = path.join(inboxPath, skillName);

  if (!fs.existsSync(skillPath)) {
    output.error(`Skill not found: ${skillName}`);
    return 2;
  }

  const result = await scanSkill(skillPath, skillName, context);

  if (options.json) {
    const jsonOutput = options.output
      ? JSON.stringify(result, null, 2)
      : JSON.stringify(formatCompactResult(result), null, 2);

    if (options.output) {
      fs.writeFileSync(options.output, jsonOutput, "utf-8");
      output.print(`Report saved to ${options.output}`);
    } else {
      console.log(jsonOutput);
    }
  } else {
    displayScanResult(result, output);
  }

  return result.status === "pass" ? 0 : 1;
}

async function scanAllSkills(
  options: ScanCommandOptions,
  context: ProgramContext,
): Promise<number> {
  const { output } = context;
  const inboxPath = getInboxDir();

  if (!fs.existsSync(inboxPath)) {
    output.error("INBOX directory not found");
    return 2;
  }

  const skillDirs = fs
    .readdirSync(inboxPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  if (skillDirs.length === 0) {
    output.print("No skills found in INBOX");
    return 0;
  }

  const results: ScanResult[] = [];
  let passCount = 0;
  let failCount = 0;

  for (const skillName of skillDirs) {
    const skillPath = path.join(inboxPath, skillName);
    const result = await scanSkill(skillPath, skillName, context);
    results.push(result);

    if (result.status === "pass") {
      passCount++;
    } else {
      failCount++;
    }

    if (!options.json) {
      const statusIcon = result.status === "pass" ? "PASS" : "FAIL";
      output.print(
        `${statusIcon} ${skillName}: ${result.status.toUpperCase()} (risk: ${result.riskScore})`,
      );
    }
  }

  if (options.json) {
    const failedResults = results.filter((r) => r.status === "fail");
    const compactOutput = {
      summary: {
        total: skillDirs.length,
        passed: passCount,
        failed: failCount,
        scanTime: new Date().toISOString(),
      },
      failedSkills: failedResults.map(formatCompactResult),
    };

    const jsonOutput = JSON.stringify(compactOutput, null, 2);

    if (options.output) {
      fs.writeFileSync(options.output, jsonOutput, "utf-8");
      output.print(`Report saved to ${options.output}`);
    } else {
      console.log(jsonOutput);
    }
  } else {
    output.print(
      `Summary: ${skillDirs.length} scanned, ${passCount} passed, ${failCount} failed`,
    );

    const failedResults = results.filter((r) => r.status === "fail");
    if (failedResults.length > 0) {
      output.print("--- Failed Skills Details ---");
      for (const result of failedResults) {
        displayScanResult(result, output);
      }
    }
  }

  return failCount > 0 ? 1 : 0;
}

async function scanSkill(
  skillPath: string,
  skillName: string,
  context: ProgramContext,
): Promise<ScanResult> {
  const { output, debug } = context;

  if (debug) {
    output.print(`Scanning skill: ${skillName} (path: ${skillPath})`);
  }

  const startTime = Date.now();

  try {
    const scanOutput = await runOpenclawScan(skillPath);
    const result = convertToScanResult(skillName, scanOutput);

    const duration = Date.now() - startTime;
    if (debug) {
      output.print(
        `Scan completed: ${skillName} (status: ${result.status}, risk: ${result.riskScore}, duration: ${duration}ms, critical: ${result.summary.critical}, warning: ${result.summary.warning})`,
      );
    }

    return result;
  } catch (error) {
    output.error(`Scan failed for ${skillName}`, (error as Error).message);
    throw error;
  }
}

function displayScanResult(
  result: ScanResult,
  output: ProgramContext["output"],
): void {
  if (result.status === "pass") {
    output.print(`PASS ${result.skillName}: PASS (risk: ${result.riskScore})`);
    return;
  }

  output.print(`FAIL ${result.skillName}: FAIL (risk: ${result.riskScore})`);

  const failedChecks = Object.values(result.checks).filter(
    (check) => check.status === "fail",
  );

  if (failedChecks.length > 0) {
    for (const check of failedChecks) {
      output.print(`  [${check.severity.toUpperCase()}] ${check.name}`);
      for (const finding of check.findings) {
        const location = finding.line
          ? `${finding.file}:${finding.line}`
          : finding.file;
        output.print(`    ${location}: ${finding.pattern}`);
      }
    }
  }
}

function formatCompactResult(result: ScanResult) {
  const inboxPath = getInboxDir();
  const skillPath = path.join(inboxPath, result.skillName);

  const fileMap = new Map<
    string,
    { lines: Set<number>; checks: Set<string> }
  >();

  for (const check of Object.values(result.checks)) {
    if (check.status !== "fail") continue;

    for (const finding of check.findings) {
      const relativePath = path.relative(skillPath, finding.file);
      const key = relativePath || path.basename(finding.file);

      if (!fileMap.has(key)) {
        fileMap.set(key, { lines: new Set(), checks: new Set() });
      }
      const entry = fileMap.get(key)!;
      if (finding.line) entry.lines.add(finding.line);
      entry.checks.add(check.id);
    }
  }

  const findings = Array.from(fileMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([file, data]) => ({
      file,
      lines: Array.from(data.lines).sort((a, b) => a - b),
      checks: Array.from(data.checks).sort(),
    }));

  return {
    skillName: result.skillName,
    status: result.status,
    riskScore: result.riskScore,
    issues: {
      critical: result.summary.critical,
      warning: result.summary.warning,
    },
    findings,
  };
}

export const scanSubcommand: SubCommandDefinition = {
  name: "scan [skill-name]",
  description: "Scan INBOX skill for security issues using OpenClaw scanner",
  options: [
    { flags: "--json", description: "Output JSON format" },
    { flags: "--all", description: "Scan all INBOX skills" },
    { flags: "--output <file>", description: "Save JSON report to file" },
    { flags: "--no-update", description: "Skip automatic scanner update" },
  ],
  action: async (args, options, context) => {
    try {
      const skillName = args.arg0 as string | undefined;
      const scanOptions: ScanCommandOptions = {
        json: options.json as boolean | undefined,
        all: options.all as boolean | undefined,
        output: options.output as string | undefined,
        noUpdate: options.noUpdate as boolean | undefined,
      };
      const exitCode = await scanCommand(skillName, scanOptions, context);
      process.exit(exitCode);
    } catch (error) {
      handleCommandError(error);
    }
  },
  helpText: {
    examples: [
      "wopal skills scan my-skill          # Scan single skill",
      "wopal skills scan --all            # Scan all INBOX skills",
      "wopal skills scan my-skill --json  # JSON output",
      "wopal skills scan my-skill --no-update  # Skip scanner update",
    ],
    notes: [
      "51 security checks (C2, malware, reverse shells, CVEs)",
      "Exit codes: 0=pass, 1=issues found, 2=error",
      "Scanner auto-updates every 24 hours",
    ],
    workflow: [
      "Download: wopal skills download <source>",
      "Scan: wopal skills scan <skill-name>",
      "Install: wopal skills install <skill-name>",
    ],
  },
};
