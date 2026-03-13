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
import {
  runOpenclawScan,
  convertToScanResult,
} from "../../scanner/openclaw-wrapper.js";
import type {
  SkillLockEntry,
  InstallMode,
  InstallScope,
} from "../../types/lock.js";
import { handleCommandError } from "../../lib/error-utils.js";

interface InstallOptions {
  global: boolean;
  force: boolean;
  skipScan: boolean;
  mode: InstallMode;
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

  const scope: InstallScope = options.global ? "global" : "project";
  if (debug) {
    output.print(`Install scope: ${scope}`);
  }

  const isLocal =
    source.includes("/") || source.includes("\\") || source.includes(path.sep);

  if (isLocal) {
    await installLocalSkill(source, scope, options, context);
  } else {
    await installInboxSkill(source, scope, options, context);
  }
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
  await lockManager.addSkillToBothLocks(skillName, lockEntry);
  output.print("Lock files updated");

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
    await runSecurityScan(skillName, skillDir, output);
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

  let skillFolderHash = metadata.skillFolderHash;
  if (!skillFolderHash) {
    if (debug) {
      output.print(
        "skillFolderHash not found in metadata, fetching from GitHub...",
      );
    }
    const token = getGitHubToken();
    const [owner, repo] = metadata.source.split("/");
    skillFolderHash = await fetchSkillFolderHash(
      `${owner}/${repo}`,
      metadata.skillPath,
      token,
    );
    if (!skillFolderHash) {
      if (debug) {
        output.print("Failed to fetch skillFolderHash, using empty string");
      }
      skillFolderHash = "";
    }
  }
  if (debug) {
    output.print(`Skill folder hash: ${skillFolderHash}`);
  }

  await copySkill(skillDir, targetDir, output);
  output.print(`Skill copied to: ${targetDir}`);

  const lockEntry: SkillLockEntry = {
    source: metadata.source.split("@")[0],
    sourceType: "github",
    sourceUrl: metadata.sourceUrl,
    skillPath: metadata.skillPath,
    skillFolderHash,
    installedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const lockManager = new LockManager(config);
  await lockManager.addSkillToBothLocks(skillName, lockEntry);
  output.print("Lock files updated");

  await fs.remove(skillDir);
  if (debug) {
    output.print(`INBOX skill removed: ${skillDir}`);
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
      const scopeText = scope === "global" ? "global" : "project";
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
  output: ProgramContext["output"],
): Promise<void> {
  const scanOutput = await runOpenclawScan(skillDir);
  const result = convertToScanResult(skillName, scanOutput);

  if (result.status === "fail") {
    throw new Error(
      `Security scan failed for skill "${skillName}" (risk score: ${result.riskScore}, critical: ${result.summary.critical}, warning: ${result.summary.warning})`,
    );
  }

  output.print(`Security scan passed (risk score: ${result.riskScore})`);
}

export const installSubcommand: SubCommandDefinition = {
  name: "install <source>",
  description: "Install a skill from INBOX or local path",
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
      description: "Skip security scan for INBOX skills",
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
      };
      await installSkill(source, installOptions, context);
    } catch (error) {
      handleCommandError(error);
    }
  },
  helpText: {
    examples: [
      "wopal skills install my-skill          # Install from INBOX",
      "wopal skills install /path/to/skill    # Install from local path",
      "wopal skills install my-skill --global # Install globally",
      "wopal skills install my-skill --force  # Force overwrite",
    ],
    notes: [
      "INBOX skills are automatically scanned for security",
      "Local skills identified by path separators (/ or \\)",
      "Lock files updated with skill metadata",
    ],
    workflow: [
      "Download: wopal skills download <source>",
      "Scan: wopal skills scan <skill-name>",
      "Install: wopal skills install <skill-name>",
      "Verify: wopal skills list",
    ],
  },
};
