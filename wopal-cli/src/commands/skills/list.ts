import { existsSync } from "fs";
import { Command } from "commander";
import { getInboxDir } from "../../lib/inbox-utils.js";
import {
  collectSkills,
  getInstalledSkillsDir,
  mergeSkills,
  SkillInfo,
} from "../../lib/skill-utils.js";
import { Logger } from "../../lib/logger.js";
import { LockManager } from "../../lib/lock-manager.js";
import type { SkillLockEntry } from "../../types/lock.js";
import { buildHelpText } from "../../lib/help-texts.js";
import { getConfig } from "../../lib/config.js";

let logger: Logger;

export function setLogger(l: Logger): void {
  logger = l;
}

interface ListOptions {
  info?: boolean;
  local?: boolean;
  global?: boolean;
  json?: boolean;
}

export function registerListCommand(program: Command): void {
  const command = program
    .command("list")
    .description(
      "List all skills (INBOX downloaded + installed from lock files)",
    )
    .option("-i, --info", "Show skill descriptions and details")
    .option("--local", "Show only project-level skills")
    .option("--global", "Show only global-level skills")
    .option("--json", "Output in JSON format")
    .action(async (options: ListOptions) => {
      await listSkills(options);
    });

  command.addHelpText(
    "after",
    buildHelpText({
      examples: [
        "# List all skills (INBOX + installed)\nwopal list",
        "# List with details\nwopal list --info",
        "# List in JSON format\nwopal list --json",
        "# List only project-level skills\nwopal list --local",
        "# List only global-level skills\nwopal list --global",
      ],
      options: [
        "-i, --info    Show skill descriptions and details",
        "--local       Show only project-level skills",
        "--global      Show only global-level skills",
        "--json        Output in JSON format",
        "--help        Show this help message",
      ],
      notes: [
        "By default shows both INBOX (downloaded) and installed skills",
        "INBOX skills are marked with [Downloaded]",
        "Installed skills are marked with [Installed]",
        "Use --local or --global to filter by scope",
      ],
    }),
  );
}

async function listSkills(options: ListOptions): Promise<void> {
  if (options.local || options.global) {
    await listInstalledSkills(options);
  } else {
    await listAllSkills(options.info || false, options.json || false);
  }
}

async function listAllSkills(
  showInfo: boolean,
  jsonOutput: boolean,
): Promise<void> {
  const inboxDir = getInboxDir();
  const installedDir = getInstalledSkillsDir();

  logger?.log(`Listing skills from INBOX: ${inboxDir}`);
  logger?.log(`Listing skills from installed: ${installedDir}`);

  const inboxSkills = collectSkills(inboxDir, "downloaded");
  const installedSkills = collectSkills(installedDir, "installed");
  const allSkills = mergeSkills(inboxSkills, installedSkills);

  if (jsonOutput) {
    console.log(
      JSON.stringify(
        {
          success: true,
          data: allSkills.map((s) => ({
            name: s.name,
            status: s.status,
            description: s.description,
            path: s.path,
          })),
        },
        null,
        2,
      ),
    );
    return;
  }

  if (allSkills.length === 0) {
    console.log("No skills found");
    return;
  }

  console.log("Skills:\n");

  for (const skill of allSkills) {
    const statusIcon =
      skill.status === "downloaded" ? "[Downloaded]" : "[Installed]";
    console.log(`  ${statusIcon} ${skill.name}`);

    if (showInfo) {
      if (skill.description) {
        console.log(`           ${skill.description}`);
      }
      console.log(`           Path: ${skill.path}`);
    }
  }
}

async function listInstalledSkills(options: ListOptions): Promise<void> {
  const lockManager = new LockManager(getConfig());

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
    console.log(
      JSON.stringify(
        {
          success: true,
          data: skillsToShow.map(([name, entry]) => ({
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
        },
        null,
        2,
      ),
    );
    return;
  }

  if (skillsToShow.length === 0) {
    console.log("No installed skills found");
    return;
  }

  console.log("Installed Skills:\n");

  for (const [skillName, entry] of skillsToShow) {
    const scope =
      options.local && options.global
        ? projectSkills.some(([name]) => name === skillName)
          ? "[Project]"
          : "[Global]"
        : options.local
          ? "[Project]"
          : "[Global]";

    console.log(`  ${scope} ${skillName}`);

    if (options.info) {
      console.log(`           Source: ${entry.source}`);
      console.log(`           Type: ${entry.sourceType}`);
      console.log(`           Installed: ${entry.installedAt}`);
      console.log(`           Updated: ${entry.updatedAt}`);
      if (entry.skillFolderHash) {
        console.log(
          `           Version: ${entry.skillFolderHash.substring(0, 16)}...`,
        );
      }
    }
  }
}
