import type { SubCommandDefinition } from "../../program/types.js";
import { getInboxDir } from "../../lib/inbox-utils.js";
import {
  collectSkills,
  getInstalledSkillsDir,
  mergeSkills,
} from "../../lib/skill-utils.js";
import { LockManager } from "../../lib/lock-manager.js";
import type { SkillLockEntry } from "../../types/lock.js";
import { handleCommandError } from "../../lib/error-utils.js";

interface ListOptions {
  info?: boolean;
  local?: boolean;
  global?: boolean;
  json?: boolean;
}

async function listSkills(
  options: ListOptions,
  context: import("../../program/types.js").ProgramContext,
): Promise<void> {
  if (options.local || options.global) {
    await listInstalledSkills(options, context);
  } else {
    await listAllSkills(options.info || false, options.json || false, context);
  }
}

async function listAllSkills(
  showInfo: boolean,
  jsonOutput: boolean,
  context: import("../../program/types.js").ProgramContext,
): Promise<void> {
  const { output, config, debug } = context;
  const inboxDir = getInboxDir();
  const installedDir = getInstalledSkillsDir();

  if (debug) {
    output.print(`Listing skills from INBOX: ${inboxDir}`);
    output.print(`Listing skills from installed: ${installedDir}`);
  }

  const inboxSkills = collectSkills(inboxDir, "downloaded");
  const installedSkills = collectSkills(installedDir, "installed");
  const allSkills = mergeSkills(inboxSkills, installedSkills);

  if (jsonOutput) {
    output.json({
      items: allSkills.map((s) => ({
        name: s.name,
        status: s.status,
        description: s.description,
        path: s.path,
      })),
    });
    return;
  }

  if (allSkills.length === 0) {
    output.print("No skills found");
    return;
  }

  output.print("Skills:");
  output.println();

  for (const skill of allSkills) {
    const statusIcon =
      skill.status === "downloaded" ? "[Downloaded]" : "[Installed]";
    output.print(`  ${statusIcon} ${skill.name}`);

    if (showInfo) {
      if (skill.description) {
        output.print(`           ${skill.description}`);
      }
      output.print(`           Path: ${skill.path}`);
    }
  }
}

async function listInstalledSkills(
  options: ListOptions,
  context: import("../../program/types.js").ProgramContext,
): Promise<void> {
  const { output, config } = context;
  const lockManager = new LockManager(config);

  const projectLock = await lockManager.readProjectLock();
  const globalLock = await lockManager.readGlobalLock();

  const projectSkills = Object.entries(projectLock.skills);
  const globalSkills = Object.entries(globalLock.skills);

  let skillsToShow: Array<[string, SkillLockEntry]> = [];

  if (options.local && options.global) {
    skillsToShow = [...projectSkills, ...globalSkills];
  } else if (options.local) {
    skillsToShow = projectSkills;
  } else if (options.global) {
    skillsToShow = globalSkills;
  }

  if (options.json) {
    output.json({
      items: skillsToShow.map(([name, entry]) => ({
        name,
        source: entry.source,
        sourceType: entry.sourceType,
        scope:
          options.local && options.global
            ? projectSkills.some(([n]) => n === name)
              ? "project"
              : "global"
            : options.local
              ? "project"
              : "global",
        installedAt: entry.installedAt,
        updatedAt: entry.updatedAt,
        skillFolderHash: entry.skillFolderHash,
      })),
    });
    return;
  }

  if (skillsToShow.length === 0) {
    output.print("No installed skills found");
    return;
  }

  output.print("Installed Skills:");
  output.println();

  for (const [skillName, entry] of skillsToShow) {
    const scope =
      options.local && options.global
        ? projectSkills.some(([name]) => name === skillName)
          ? "[Project]"
          : "[Global]"
        : options.local
          ? "[Project]"
          : "[Global]";

    output.print(`  ${scope} ${skillName}`);

    if (options.info) {
      output.print(`           Source: ${entry.source}`);
      output.print(`           Type: ${entry.sourceType}`);
      output.print(`           Installed: ${entry.installedAt}`);
      output.print(`           Updated: ${entry.updatedAt}`);
      if (entry.skillFolderHash) {
        output.print(
          `           Version: ${entry.skillFolderHash.substring(0, 16)}...`,
        );
      }
    }
  }
}

export const listSubcommand: SubCommandDefinition = {
  name: "list",
  description: "List all skills (INBOX downloaded + installed from lock files)",
  options: [
    { flags: "-i, --info", description: "Show skill descriptions and details" },
    { flags: "--local", description: "Show only project-level skills" },
    { flags: "--global", description: "Show only global-level skills" },
    { flags: "--json", description: "Output in JSON format" },
  ],
  action: async (_args, options, context) => {
    try {
      const listOptions: ListOptions = {
        info: options.info as boolean | undefined,
        local: options.local as boolean | undefined,
        global: options.global as boolean | undefined,
        json: options.json as boolean | undefined,
      };
      await listSkills(listOptions, context);
    } catch (error) {
      handleCommandError(error);
    }
  },
  helpText: {
    examples: [
      "wopal skills list               # List all skills",
      "wopal skills list --info        # List with details",
      "wopal skills list --local       # Project-level only",
      "wopal skills list --json        # JSON output",
    ],
    notes: [
      "Shows both INBOX (downloaded) and installed skills",
      "INBOX skills marked with [Downloaded]",
      "Installed skills marked with [Installed]",
    ],
  },
};
