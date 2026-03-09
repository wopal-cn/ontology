import { existsSync, rmSync, readdirSync, statSync, readFileSync } from "fs";
import { join } from "path";
import { Command } from "commander";
import pc from "picocolors";
import {
  getInboxDir,
  getDirectorySize,
  formatSize,
  buildDirectoryTree,
} from "../utils/inbox-utils.js";
import { Logger } from "../utils/logger.js";
import { buildHelpText } from "../utils/help-texts.js";

let logger: Logger;

export function setLogger(l: Logger): void {
  logger = l;
}

export function registerInboxCommand(program: Command): void {
  const inbox = program
    .command("inbox")
    .description("Manage skills in INBOX (downloaded but not yet installed)");

  const listCommand = inbox
    .command("list")
    .description("List all skills in INBOX")
    .option("--json", "Output in JSON format")
    .action(async (options: { json?: boolean }) => {
      await listInboxSkills(options.json);
    });

  listCommand.addHelpText(
    "after",
    buildHelpText({
      examples: [
        "# List all skills in INBOX\nwopal inbox list",
        "# List in JSON format\nwopal inbox list --json",
      ],
      options: [
        "--json    Output in JSON format",
        "--help    Show this help message",
      ],
      notes: [
        "Skills are stored in INBOX after download",
        "Use 'wopal inbox show <skill>' to view skill details",
        "Use 'wopal inbox remove <skill>' to delete a skill",
      ],
    }),
  );

  const showCommand = inbox
    .command("show <skill>")
    .description(
      "Show skill details (SKILL.md content and directory structure)",
    )
    .action(async (skillName: string) => {
      await showInboxSkill(skillName);
    });

  showCommand.addHelpText(
    "after",
    buildHelpText({
      examples: [
        "# Show skill details\nwopal inbox show my-skill",
      ],
      notes: [
        "Displays SKILL.md content and directory structure",
        "Useful for reviewing skills before installation",
      ],
    }),
  );

  const removeCommand = inbox
    .command("remove <skill>")
    .description("Remove a single skill from INBOX")
    .action(async (skillName: string) => {
      await removeInboxSkill(skillName);
    });

  removeCommand.addHelpText(
    "after",
    buildHelpText({
      examples: [
        "# Remove a skill from INBOX\nwopal inbox remove my-skill",
      ],
      notes: [
        "Permanently deletes the skill from INBOX",
        "Use 'wopal inbox list' to see available skills",
      ],
    }),
  );

  inbox.addHelpText(
    "after",
    buildHelpText({
      examples: [
        "# List all skills in INBOX\nwopal inbox list",
        "# Show skill details\nwopal inbox show my-skill",
        "# Remove a skill\nwopal inbox remove my-skill",
      ],
      workflow: [
        "Download skills: wopal skills download <source>",
        "List INBOX: wopal inbox list",
        "Review skills: wopal inbox show <skill-name>",
        "Scan for security: wopal skills scan <skill-name>",
        "Install: wopal skills install <skill-name>",
      ],
    }),
  );
}

async function listInboxSkills(jsonOutput: boolean = false): Promise<void> {
  const inboxDir = getInboxDir();
  logger?.log(`Listing INBOX skills from: ${inboxDir}`);

  if (!existsSync(inboxDir)) {
    if (jsonOutput) {
      console.log(JSON.stringify({ success: true, data: [] }, null, 2));
    } else {
      console.log(pc.yellow("INBOX is empty"));
    }
    return;
  }

  const entries = existsSync(inboxDir) ? readdirSync(inboxDir) : [];
  const skills = entries.filter((entry: string) => {
    return statSync(join(inboxDir, entry)).isDirectory();
  });

  if (skills.length === 0) {
    if (jsonOutput) {
      console.log(JSON.stringify({ success: true, data: [] }, null, 2));
    } else {
      console.log(pc.yellow("INBOX is empty"));
    }
    return;
  }

  const skillList = skills.map((skill: string) => {
    const skillPath = join(inboxDir, skill);
    const size = getDirectorySize(skillPath);
    return {
      name: skill,
      size: formatSize(size),
      path: skillPath,
    };
  });

  if (jsonOutput) {
    console.log(JSON.stringify({ success: true, data: skillList }, null, 2));
  } else {
    console.log(pc.bold("Skills in INBOX:\n"));
    for (const skill of skillList) {
      console.log(`  ${pc.cyan(skill.name)} ${pc.dim(`(${skill.size})`)}`);
    }
  }
}

async function showInboxSkill(skillName: string): Promise<void> {
  const inboxDir = getInboxDir();
  const skillDir = join(inboxDir, skillName);
  const skillMdPath = join(skillDir, "SKILL.md");

  logger?.log(`Showing skill: ${skillName} at ${skillDir}`);

  if (!existsSync(skillDir)) {
    console.error(pc.red(`Skill '${skillName}' not found in INBOX`));
    process.exit(1);
  }

  if (!existsSync(skillMdPath)) {
    console.warn(pc.yellow("Invalid skill directory (missing SKILL.md)"));
    return;
  }

  const content = readFileSync(skillMdPath, "utf-8");
  console.log(content);

  console.log(pc.bold("\nDirectory Structure:"));
  const tree = buildDirectoryTree(skillDir);
  console.log(tree);
}

async function removeInboxSkill(skillName: string): Promise<void> {
  const inboxDir = getInboxDir();
  const skillDir = join(inboxDir, skillName);

  logger?.log(`Removing skill: ${skillName} from ${skillDir}`);

  if (!existsSync(skillDir)) {
    console.error(pc.red(`Skill '${skillName}' not found in INBOX`));
    process.exit(1);
  }

  rmSync(skillDir, { recursive: true, force: true });
  console.log(pc.green(`✓ Skill '${skillName}' removed from INBOX`));
}
