import * as path from "path";
import * as fs from "fs";
import { Command } from "commander";
import { Logger } from "../../lib/logger.js";
import { scanSkill } from "../../scanner/scanner.js";
import { ScanResult } from "../../scanner/types.js";
import { getInboxDir } from "../../lib/inbox-utils.js";
import { buildHelpText } from "../../lib/help-texts.js";

let logger: Logger;

export function setLogger(l: Logger): void {
  logger = l;
}

export interface ScanCommandOptions {
  json?: boolean;
  all?: boolean;
  output?: string;
}

export function registerScanCommand(program: Command): void {
  const command = program
    .command("scan [skill-name]")
    .description("Scan INBOX skill for security issues")
    .option("--json", "Output JSON format")
    .option("--all", "Scan all INBOX skills")
    .option("--output <file>", "Save JSON report to file")
    .action(
      async (skillName: string | undefined, options: ScanCommandOptions) => {
        const exitCode = await scanCommand(skillName, options);
        process.exit(exitCode);
      },
    );

  command.addHelpText(
    "after",
    buildHelpText({
      examples: [
        "# Scan a single skill\nwopal skills scan my-skill",
        "# Scan all skills in INBOX\nwopal skills scan --all",
        "# Output in JSON format\nwopal skills scan my-skill --json",
        "# Save report to file\nwopal skills scan my-skill --json --output report.json",
      ],
      options: [
        "--json              Output in JSON format",
        "--all               Scan all INBOX skills",
        "--output <file>     Save JSON report to file",
        "--help              Show this help message",
      ],
      notes: [
        "Scans skills in INBOX for security issues",
        "Checks for 20 security patterns (9 critical + 11 warning)",
        "Exit codes: 0=pass, 1=issues found, 2=error",
        "Use before installing skills from external sources",
      ],
      workflow: [
        "Download skills: wopal skills download <source>",
        "List INBOX: wopal inbox list",
        "Scan skills: wopal skills scan <skill-name>",
        "Review results and install if safe: wopal skills install <skill-name>",
      ],
    }),
  );
}

export async function scanCommand(
  skillName: string | undefined,
  options: ScanCommandOptions,
): Promise<number> {
  try {
    if (options.all) {
      return await scanAllSkills(options);
    } else if (skillName) {
      return await scanSingleSkill(skillName, options);
    } else {
      console.error(
        "Error: Missing required argument: skill-name\n\nUse 'wopal skills scan <skill-name>' to scan a single skill\nUse 'wopal skills scan --all' to scan all skills in INBOX",
      );
      return 2;
    }
  } catch (error) {
    logger.error("Scan failed", { error: (error as Error).message });
    return 2;
  }
}

async function scanSingleSkill(
  skillName: string,
  options: ScanCommandOptions,
): Promise<number> {
  const inboxPath = getInboxDir();
  const skillPath = path.join(inboxPath, skillName);

  if (!fs.existsSync(skillPath)) {
    logger.error(`Skill not found: ${skillName}`);
    return 2;
  }

  const result = await scanSkill(skillPath, skillName);

  if (options.json) {
    const jsonOutput = options.output
      ? JSON.stringify(result, null, 2)
      : JSON.stringify(formatCompactResult(result), null, 2);

    if (options.output) {
      fs.writeFileSync(options.output, jsonOutput, "utf-8");
      console.log(`Report saved to ${options.output}`);
    } else {
      console.log(jsonOutput);
    }
  } else {
    displayScanResult(result);
  }

  return result.status === "pass" ? 0 : 1;
}

async function scanAllSkills(options: ScanCommandOptions): Promise<number> {
  const inboxPath = getInboxDir();

  if (!fs.existsSync(inboxPath)) {
    logger.error("INBOX directory not found");
    return 2;
  }

  const skillDirs = fs
    .readdirSync(inboxPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  if (skillDirs.length === 0) {
    logger.info("No skills found in INBOX");
    return 0;
  }

  const results: ScanResult[] = [];
  let passCount = 0;
  let failCount = 0;

  for (const skillName of skillDirs) {
    const skillPath = path.join(inboxPath, skillName);
    const result = await scanSkill(skillPath, skillName);
    results.push(result);

    if (result.status === "pass") {
      passCount++;
    } else {
      failCount++;
    }

    if (!options.json) {
      const statusIcon = result.status === "pass" ? "✓" : "✗";
      console.log(
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
      console.log(`Report saved to ${options.output}`);
    } else {
      console.log(jsonOutput);
    }
  } else {
    console.log(
      `\nSummary: ${skillDirs.length} scanned, ${passCount} passed, ${failCount} failed`,
    );

    const failedResults = results.filter((r) => r.status === "fail");
    if (failedResults.length > 0) {
      console.log("\n--- Failed Skills Details ---");
      for (const result of failedResults) {
        displayScanResult(result);
      }
    }
  }

  return failCount > 0 ? 1 : 0;
}

function displayScanResult(result: ScanResult): void {
  if (result.status === "pass") {
    console.log(`✓ ${result.skillName}: PASS (risk: ${result.riskScore})`);
    return;
  }

  console.log(`\n✗ ${result.skillName}: FAIL (risk: ${result.riskScore})`);

  const failedChecks = Object.values(result.checks).filter(
    (check) => check.status === "fail",
  );

  if (failedChecks.length > 0) {
    for (const check of failedChecks) {
      console.log(`  [${check.severity.toUpperCase()}] ${check.name}`);
      for (const finding of check.findings) {
        const location = finding.line
          ? `${finding.file}:${finding.line}`
          : finding.file;
        console.log(`    ${location}: ${finding.pattern}`);
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
