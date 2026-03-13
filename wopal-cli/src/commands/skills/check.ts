import type {
  SubCommandDefinition,
  ProgramContext,
} from "../../program/types.js";
import { LockManager } from "../../lib/lock-manager.js";
import type { SkillLockEntry } from "../../types/lock.js";
import { fetchSkillFolderHash, getGitHubToken } from "../../lib/skill-lock.js";
import { computeSkillFolderHash } from "../../lib/hash.js";
import pLimit from "p-limit";
import { handleCommandError } from "../../lib/error-utils.js";

export interface CheckCommandOptions {
  local?: boolean;
  global?: boolean;
  json?: boolean;
}

export interface CheckResult {
  skillName: string;
  sourceType: "github" | "local" | "well-known";
  status:
    | "up-to-date"
    | "update-available"
    | "source-changed"
    | "source-missing"
    | "error";
  installedHash: string;
  latestHash: string;
  error?: string;
}

async function checkCommand(
  skillName: string | undefined,
  options: CheckCommandOptions,
  context: ProgramContext,
): Promise<void> {
  const { output, config } = context;
  try {
    const lockManager = new LockManager(config);

    let skills: Record<string, SkillLockEntry>;

    if (options.local) {
      const projectLock = await lockManager.readProjectLock();
      skills = projectLock.skills;
    } else if (options.global) {
      const globalLock = await lockManager.readGlobalLock();
      const projectLock = await lockManager.readProjectLock();
      const projectSkillNames = new Set(Object.keys(projectLock.skills));
      skills = {};
      for (const [name, entry] of Object.entries(globalLock.skills)) {
        if (!projectSkillNames.has(name)) {
          skills[name] = entry;
        }
      }
    } else {
      const [projectLock, globalLock] = await Promise.all([
        lockManager.readProjectLock(),
        lockManager.readGlobalLock(),
      ]);
      skills = { ...globalLock.skills, ...projectLock.skills };
    }

    if (Object.keys(skills).length === 0) {
      output.print("No installed skills found.");
      return;
    }

    if (skillName) {
      if (!skills[skillName]) {
        output.error(`Skill not found: ${skillName}`);
        return;
      }
      const singleSkill: Record<string, SkillLockEntry> = {
        [skillName]: skills[skillName],
      };
      const results = await checkSkills(singleSkill, options, context);
      displayResults(results, options, output);
    } else {
      const results = await checkSkills(skills, options, context);
      displayResults(results, options, output);
    }
  } catch (error) {
    output.error("Check failed", (error as Error).message);
    process.exit(1);
  }
}

async function checkSkills(
  skills: Record<string, SkillLockEntry>,
  options: CheckCommandOptions,
  context: ProgramContext,
): Promise<CheckResult[]> {
  const { output } = context;
  const skillNames = Object.keys(skills);
  const total = skillNames.length;

  if (!options.json) {
    output.print(`Checking ${total} skill${total > 1 ? "s" : ""}...`);
  }

  const limit = pLimit(5);
  const token = getGitHubToken() ?? undefined;

  const checkPromises = skillNames.map((skillName, index) =>
    limit(async () => {
      const entry = skills[skillName];
      const current = index + 1;

      if (!options.json) {
        const percentage = Math.round((current / total) * 100);
        const barLength = 20;
        const filled = Math.round((current / total) * barLength);
        const bar =
          "=".repeat(filled) +
          ">".repeat(filled < barLength ? 1 : 0) +
          " ".repeat(barLength - filled - (filled < barLength ? 1 : 0));

        const checkType =
          entry.sourceType === "github"
            ? "Fetching GitHub Tree SHA..."
            : entry.sourceType === "local"
              ? "Computing local hash..."
              : "Well-known source check not supported";

        output.print(
          `[${bar}] ${percentage}% [${current}/${total}] Checking ${skillName}... (${checkType})`,
        );
      }

      return await checkSkillWithRetry(skillName, entry, token);
    }),
  );

  const timeoutMs = 5 * 60 * 1000;
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("Check timeout (5 minutes)")), timeoutMs);
  });

  const results = await Promise.race([
    Promise.allSettled(checkPromises),
    timeoutPromise,
  ]);

  return results.map((result, index) => {
    if (result.status === "fulfilled") {
      return result.value;
    } else {
      return {
        skillName: skillNames[index],
        sourceType: skills[skillNames[index]].sourceType,
        status: "error" as const,
        installedHash: skills[skillNames[index]].skillFolderHash,
        latestHash: "",
        error: result.reason?.message || "Unknown error",
      };
    }
  });
}

async function checkSkillWithRetry(
  skillName: string,
  entry: SkillLockEntry,
  token: string | undefined,
  maxRetries: number = 3,
): Promise<CheckResult> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await checkSkill(skillName, entry, token);
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt - 1) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  return {
    skillName,
    sourceType: entry.sourceType,
    status: "error",
    installedHash: entry.skillFolderHash,
    latestHash: "",
    error: lastError?.message || "Max retries exceeded",
  };
}

async function checkSkill(
  skillName: string,
  entry: SkillLockEntry,
  token: string | undefined,
): Promise<CheckResult> {
  try {
    let latestHash: string;

    if (entry.sourceType === "github") {
      const hash = await fetchSkillFolderHash(
        entry.source,
        entry.skillPath,
        token,
      );
      if (!hash) {
        throw new Error("Failed to fetch GitHub Tree SHA");
      }
      latestHash = hash;
    } else if (entry.sourceType === "local") {
      latestHash = await computeSkillFolderHash(entry.sourceUrl);
    } else {
      return {
        skillName,
        sourceType: entry.sourceType,
        status: "error",
        installedHash: entry.skillFolderHash,
        latestHash: "",
        error: "Version check is not supported for well-known sources yet",
      };
    }

    let status: CheckResult["status"];
    if (latestHash === entry.skillFolderHash) {
      status = "up-to-date";
    } else {
      status =
        entry.sourceType === "github" ? "update-available" : "source-changed";
    }

    return {
      skillName,
      sourceType: entry.sourceType,
      status,
      installedHash: entry.skillFolderHash,
      latestHash,
    };
  } catch (error) {
    return {
      skillName,
      sourceType: entry.sourceType,
      status: "error",
      installedHash: entry.skillFolderHash,
      latestHash: "",
      error: (error as Error).message,
    };
  }
}

function displayResults(
  results: CheckResult[],
  options: CheckCommandOptions,
  output: ProgramContext["output"],
): void {
  if (options.json) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  const upToDate = results.filter((r) => r.status === "up-to-date");
  const updateAvailable = results.filter(
    (r) => r.status === "update-available",
  );
  const sourceChanged = results.filter((r) => r.status === "source-changed");
  const sourceMissing = results.filter((r) => r.status === "source-missing");
  const errors = results.filter((r) => r.status === "error");

  output.print("=== Check Results ===");
  output.println();

  if (updateAvailable.length > 0) {
    output.print("Update Available:");
    updateAvailable
      .sort((a, b) => a.skillName.localeCompare(b.skillName))
      .forEach((r) => {
        output.print(`  ${r.skillName} (${r.sourceType})`);
        output.print(`    Installed: ${r.installedHash.substring(0, 8)}`);
        output.print(`    Latest:    ${r.latestHash.substring(0, 8)}`);
      });
    output.println();
  }

  if (sourceChanged.length > 0) {
    output.print("Source Changed:");
    sourceChanged
      .sort((a, b) => a.skillName.localeCompare(b.skillName))
      .forEach((r) => {
        output.print(`  ${r.skillName} (${r.sourceType})`);
        output.print(`    Installed: ${r.installedHash.substring(0, 8)}`);
        output.print(`    Current:   ${r.latestHash.substring(0, 8)}`);
      });
    output.println();
  }

  if (sourceMissing.length > 0) {
    output.print("Source Missing:");
    sourceMissing
      .sort((a, b) => a.skillName.localeCompare(b.skillName))
      .forEach((r) => {
        output.print(`  ${r.skillName} (${r.sourceType})`);
      });
    output.println();
  }

  if (errors.length > 0) {
    output.print("Errors:");
    errors
      .sort((a, b) => a.skillName.localeCompare(b.skillName))
      .forEach((r) => {
        output.print(`  ${r.skillName}: ${r.error}`);
      });
    output.println();
  }

  if (upToDate.length > 0) {
    output.print("Up to Date:");
    upToDate
      .sort((a, b) => a.skillName.localeCompare(b.skillName))
      .forEach((r) => {
        output.print(`  ${r.skillName} (${r.sourceType})`);
      });
    output.println();
  }

  output.print("=== Summary ===");
  output.print(`Total:        ${results.length}`);
  output.print(`Up to Date:   ${upToDate.length}`);
  output.print(`Updates:      ${updateAvailable.length}`);
  output.print(`Changed:      ${sourceChanged.length}`);
  output.print(`Missing:      ${sourceMissing.length}`);
  output.print(`Errors:       ${errors.length}`);

  if (updateAvailable.length > 0 || sourceChanged.length > 0) {
    const updateList = updateAvailable.map((r) => r.skillName);
    const changedList = sourceChanged.map((r) => r.skillName);
    const allUpdates = [...updateList, ...changedList];

    output.print(`To update: wopal skills update ${allUpdates.join(" ")}`);
  }
}

export const checkSubcommand: SubCommandDefinition = {
  name: "check [skill-name]",
  description: "Check installed skills for updates",
  options: [
    { flags: "--local", description: "Only check space-level skills" },
    { flags: "--global", description: "Only check global-level skills" },
    { flags: "--json", description: "Output JSON format report" },
  ],
  action: async (args, options, context) => {
    try {
      const skillName = args.arg0 as string | undefined;
      const checkOptions: CheckCommandOptions = {
        local: options.local as boolean | undefined,
        global: options.global as boolean | undefined,
        json: options.json as boolean | undefined,
      };
      await checkCommand(skillName, checkOptions, context);
    } catch (error) {
      handleCommandError(error);
    }
  },
  helpText: {
    examples: [
      "wopal skills check              # Check all installed skills",
      "wopal skills check my-skill     # Check specific skill",
      "wopal skills check --local      # Check space-level only",
      "wopal skills check --json       # JSON output",
    ],
    notes: [
      "GitHub skills: compares Tree SHA from API",
      "Local skills: compares folder content hash",
      "Requires GITHUB_TOKEN for higher API rate limits",
    ],
  },
};
