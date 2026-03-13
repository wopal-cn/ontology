import fs from "fs-extra";
import path from "path";
import type {
  SubCommandDefinition,
  ProgramContext,
} from "../../program/types.js";
import { LockManager } from "../../lib/lock-manager.js";
import { getInboxDir } from "../../lib/inbox-utils.js";
import { readMetadata } from "../../lib/metadata.js";
import { fetchSkillFolderHash, getGitHubToken } from "../../lib/skill-lock.js";
import { computeSkillFolderHash } from "../../lib/hash.js";
import { scanSkill } from "./scan.js";
import type {
  SkillLockEntry,
  InstallMode,
  InstallScope,
} from "../../types/lock.js";
import { handleCommandError } from "../../lib/error-utils.js";
import {
  downloadParsedSourceToInbox,
  parseDownloadSource,
} from "../../lib/download-skill.js";

interface InstallOptions {
  global: boolean;
  force: boolean;
  skipScan: boolean;
  mode: InstallMode;
  rmInbox: boolean;
}

type SourceType = "local" | "inbox" | "remote";

async function checkGitHubRepoVisibility(
  owner: string,
  repo: string,
): Promise<"public" | "not_found_or_private" | "unknown"> {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}`,
      {
        headers: {
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "wopal-cli",
        },
      },
    );

    if (response.ok) {
      return "public";
    }
    if (response.status === 404) {
      return "not_found_or_private";
    }
    return "unknown";
  } catch {
    return "unknown";
  }
}

function detectSourceType(source: string): SourceType {
  if (/^\/|^[a-zA-Z]:[/\\]/.test(source)) {
    return "local";
  }
  if (parseDownloadSource(source)) {
    return "remote";
  }
  return "inbox";
}

async function installSkill(
  source: string,
  options: InstallOptions,
  context: ProgramContext,
): Promise<void> {
  const { output, debug } = context;

  if (debug) {
    output.print(`Installing skill from: ${source}`);
    output.print(`Options: ${JSON.stringify(options)}`);
  }

  if (options.mode === "symlink") {
    throw new Error("symlink mode is not implemented yet");
  }

  const scope: InstallScope = options.global ? "global" : "space";
  if (debug) {
    output.print(`Install scope: ${scope}`);
  }

  const sourceType = detectSourceType(source);

  switch (sourceType) {
    case "local":
      await installLocalSkill(source, scope, options, context);
      break;
    case "remote":
      await installRemoteSkill(source, scope, options, context);
      break;
    case "inbox":
      await installInboxSkill(source, scope, options, context);
      break;
  }
}

async function installRemoteSkill(
  source: string,
  scope: InstallScope,
  options: InstallOptions,
  context: ProgramContext,
): Promise<void> {
  const { output, config } = context;

  const parsedSource = parseDownloadSource(source);
  if (!parsedSource) {
    throw new Error(`Invalid remote source format: ${source}`);
  }

  const displaySource =
    parsedSource.type === "github"
      ? `${parsedSource.owner}/${parsedSource.repo}@${parsedSource.skill}`
      : `${parsedSource.source}@${parsedSource.skill}`;
  const skillName = parsedSource.skill;

  output.print(`Installing remote skill: ${displaySource}`);
  output.print("Downloading...");

  const inboxDir = config.getSkillsInboxDir();

  const result = await downloadParsedSourceToInbox(
    parsedSource,
    inboxDir,
    { force: options.force },
    context,
  );

  if (result.failed.length > 0) {
    const failureMessage = result.failed[0]!.error;

    if (
      parsedSource.type === "github" &&
      failureMessage.includes("Failed to get commit info: 404")
    ) {
      const visibility = await checkGitHubRepoVisibility(
        parsedSource.owner,
        parsedSource.repo,
      );

      if (visibility === "not_found_or_private") {
        throw new Error(
          `Failed to download skill '${skillName}' from ${parsedSource.owner}/${parsedSource.repo}.\n` +
            `The repository is not publicly accessible (deleted, renamed, or private), but may still appear in skills.sh search results.\n` +
            `Try another source:\n` +
            `  wopal skills find ${skillName}`,
        );
      }
    }

    throw new Error(failureMessage);
  }

  if (result.success.length === 0) {
    throw new Error(
      `Failed to download skill '${skillName}' from ${displaySource}`,
    );
  }

  const skillDestPath = path.join(inboxDir, skillName);

  if (!options.skipScan) {
    output.print("Running security scan...");
    try {
      const result = await scanSkill(skillDestPath, skillName, context, false);
      if (result.status === "fail") {
        throw new Error(
          `Security scan failed (risk: ${result.riskScore}, critical: ${result.summary.critical})\n` +
            `Skill preserved in INBOX for manual review`,
        );
      }
      output.print(`Security scan passed (risk: ${result.riskScore})`);
    } catch (error) {
      output.print("Skill preserved in INBOX due to scan failure");
      throw error;
    }
  }

  await installInboxSkill(skillName, scope, options, context);
}

async function installLocalSkill(
  skillPath: string,
  scope: InstallScope,
  options: InstallOptions,
  context: ProgramContext,
): Promise<void> {
  const { output, config, debug } = context;
  const absolutePath = path.resolve(skillPath);

  if (debug) {
    output.print(`Resolved local path: ${absolutePath}`);
  }

  if (!(await fs.pathExists(absolutePath))) {
    throw new Error(`Local skill path not found: ${absolutePath}`);
  }

  const skillMdPath = path.join(absolutePath, "SKILL.md");
  if (!(await fs.pathExists(skillMdPath))) {
    throw new Error(`SKILL.md not found in: ${absolutePath}`);
  }

  const skillName = path.basename(absolutePath);
  output.print(`Installing local skill: ${skillName}`);

  const targetDir = getTargetDir(skillName, scope, config);
  if (debug) {
    output.print(`Target directory: ${targetDir}`);
  }

  await checkExistingSkill(skillName, targetDir, options.force, scope, output);

  const skillFolderHash = await computeSkillFolderHash(absolutePath);
  if (debug) {
    output.print(`Computed skill folder hash: ${skillFolderHash}`);
  }

  await copySkill(absolutePath, targetDir, output);
  output.print(`Skill copied to: ${targetDir}`);

  const lockEntry: SkillLockEntry = {
    source: `my-skills/${skillName}`,
    sourceType: "local",
    sourceUrl: absolutePath,
    skillPath: absolutePath,
    skillFolderHash,
    installedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const lockManager = new LockManager(config);
  await lockManager.addSkillToLock(skillName, lockEntry, scope);
  output.print("Lock file updated");

  output.print(`Installation complete: ${skillName}`);
}

async function installInboxSkill(
  skillName: string,
  scope: InstallScope,
  options: InstallOptions,
  context: ProgramContext,
): Promise<void> {
  const { output, config, debug } = context;
  const inboxDir = getInboxDir();
  const skillDir = path.join(inboxDir, skillName);

  if (debug) {
    output.print(`INBOX directory: ${inboxDir}`);
    output.print(`Skill directory: ${skillDir}`);
  }

  if (!(await fs.pathExists(skillDir))) {
    throw new Error(`Skill not found in INBOX: ${skillName}`);
  }

  const skillMdPath = path.join(skillDir, "SKILL.md");
  if (!(await fs.pathExists(skillMdPath))) {
    throw new Error(`SKILL.md not found in INBOX skill: ${skillName}`);
  }

  const targetDir = getTargetDir(skillName, scope, config);
  if (debug) {
    output.print(`Target directory: ${targetDir}`);
  }

  await checkExistingSkill(skillName, targetDir, options.force, scope, output);

  if (!options.skipScan) {
    output.print("Running security scan...");
    await runSecurityScan(skillName, skillDir, context);
  } else {
    if (debug) {
      output.print("Skipping security scan (--skip-scan)");
    }
  }

  const metadata = await readMetadata(skillDir);
  if (!metadata) {
    throw new Error(`Failed to read metadata for skill: ${skillName}`);
  }
  if (debug) {
    output.print(`Skill metadata: ${JSON.stringify(metadata)}`);
  }

  const source = metadata.source.split("@")[0] || metadata.source;
  const sourceType: SkillLockEntry["sourceType"] = metadata.sourceUrl.includes(
    "github.com",
  )
    ? "github"
    : "well-known";

  let skillFolderHash = metadata.skillFolderHash;
  if (!skillFolderHash) {
    if (sourceType === "github") {
      if (debug) {
        output.print(
          "skillFolderHash not found in metadata, fetching from GitHub...",
        );
      }
      const token = getGitHubToken();
      skillFolderHash = await fetchSkillFolderHash(
        source,
        metadata.skillPath,
        token,
      );
      if (!skillFolderHash) {
        if (debug) {
          output.print("Failed to fetch skillFolderHash, using empty string");
        }
        skillFolderHash = "";
      }
    } else {
      if (debug) {
        output.print(
          "skillFolderHash not found in metadata, computing local hash...",
        );
      }
      skillFolderHash = await computeSkillFolderHash(skillDir);
    }
  }
  if (debug) {
    output.print(`Skill folder hash: ${skillFolderHash}`);
  }

  await copySkill(skillDir, targetDir, output);
  output.print(`Skill copied to: ${targetDir}`);

  const lockEntry: SkillLockEntry = {
    source,
    sourceType,
    sourceUrl: metadata.sourceUrl,
    skillPath: metadata.skillPath,
    skillFolderHash,
    installedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const lockManager = new LockManager(config);
  await lockManager.addSkillToLock(skillName, lockEntry, scope);
  output.print("Lock file updated");

  if (options.rmInbox) {
    await fs.remove(skillDir);
    if (debug) {
      output.print(`INBOX skill removed: ${skillDir}`);
    }
  } else if (debug) {
    output.print(`INBOX skill preserved: ${skillDir}`);
  }

  output.print(`Installation complete: ${skillName}`);
}

function getTargetDir(
  skillName: string,
  scope: InstallScope,
  config: ProgramContext["config"],
): string {
  if (scope === "global") {
    return path.join(config.getGlobalSkillsDir(), skillName);
  } else {
    return path.join(config.getSkillsDir(), skillName);
  }
}

async function checkExistingSkill(
  skillName: string,
  targetDir: string,
  force: boolean,
  scope: InstallScope,
  output: ProgramContext["output"],
): Promise<void> {
  if (await fs.pathExists(targetDir)) {
    if (!force) {
      const scopeText = scope === "global" ? "global" : "space";
      throw new Error(
        `Skill "${skillName}" already installed in ${scopeText} scope.\n` +
          `Use --force to overwrite or remove it first.`,
      );
    }
    output.print(`Removing existing skill: ${targetDir}`);
    await fs.remove(targetDir);
  }
}

async function copySkill(
  sourceDir: string,
  targetDir: string,
  output: ProgramContext["output"],
): Promise<void> {
  await fs.ensureDir(path.dirname(targetDir));
  await fs.copy(sourceDir, targetDir, {
    filter: (src: string) => {
      const basename = path.basename(src);
      return ![".git", "node_modules", "metadata.json"].includes(basename);
    },
  });
}

async function runSecurityScan(
  skillName: string,
  skillDir: string,
  context: ProgramContext,
): Promise<void> {
  const { output } = context;
  const result = await scanSkill(skillDir, skillName, context, false);

  if (result.status === "fail") {
    throw new Error(
      `Security scan failed for skill "${skillName}" (risk score: ${result.riskScore}, critical: ${result.summary.critical}, warning: ${result.summary.warning})`,
    );
  }

  output.print(`Security scan passed (risk score: ${result.riskScore})`);
}

export const installSubcommand: SubCommandDefinition = {
  name: "install <source>",
  description: "Install a skill from INBOX, local path, or remote source",
  options: [
    {
      flags: "-g, --global",
      description: "Install to global scope (~/.wopal/skills/)",
    },
    {
      flags: "--force",
      description: "Force overwrite if skill already exists",
    },
    {
      flags: "--skip-scan",
      description: "Skip security scan",
    },
    {
      flags: "--rm-inbox",
      description: "Remove skill from INBOX after installation",
    },
    {
      flags: "--mode <mode>",
      description: "Install mode (copy or symlink)",
      defaultValue: "copy",
    },
  ],
  action: async (args, options, context) => {
    try {
      const source = args.arg0 as string;
      const installOptions: InstallOptions = {
        global: options.global as boolean,
        force: options.force as boolean,
        skipScan: options.skipScan as boolean,
        mode: (options.mode as InstallMode) || "copy",
        rmInbox: options.rmInbox as boolean,
      };
      await installSkill(source, installOptions, context);
    } catch (error) {
      handleCommandError(error);
    }
  },
  helpText: {
    examples: [
      "wopal skills install my-skill                    # Install from INBOX",
      "wopal skills install /path/to/skill             # Install from local path",
      "wopal skills install owner/repo@skill           # Download, scan, install",
      "wopal skills install some.domain@skill          # Install from well-known source",
      "wopal skills install my-skill --global          # Install globally",
      "wopal skills install my-skill --rm-inbox        # Remove from INBOX after install",
      "wopal skills install owner/repo@skill --rm-inbox # Full auto with cleanup",
    ],
    notes: [
      "Remote formats (owner/repo@skill, source@skill, skills.sh URL) auto-download and scan",
      "INBOX skills are preserved by default, use --rm-inbox to remove",
      "Local paths must be absolute (start with / or drive letter)",
    ],
    workflow: [
      "INBOX: download -> scan -> install",
      "Remote: auto download + scan + install",
      "Local: direct install",
    ],
  },
};
