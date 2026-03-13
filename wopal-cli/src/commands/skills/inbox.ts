import { existsSync, rmSync, readdirSync, statSync, readFileSync } from "fs";
import { join } from "path";
import type {
  SubCommandDefinition,
  ProgramContext,
} from "../../program/types.js";
import {
  getInboxDir,
  getDirectorySize,
  formatSize,
  buildDirectoryTree,
} from "../../lib/inbox-utils.js";
import { handleCommandError } from "../../lib/error-utils.js";

async function listInboxSkills(
  jsonOutput: boolean,
  context: ProgramContext,
): Promise<void> {
  const { output, debug } = context;
  const inboxDir = getInboxDir();

  if (debug) {
    output.print(`Listing INBOX skills from: ${inboxDir}`);
  }

  if (!existsSync(inboxDir)) {
    if (jsonOutput) {
      output.json({ items: [] });
    } else {
      output.print("INBOX is empty");
    }
    return;
  }

  const entries = existsSync(inboxDir) ? readdirSync(inboxDir) : [];
  const skills = entries.filter((entry: string) => {
    return statSync(join(inboxDir, entry)).isDirectory();
  });

  if (skills.length === 0) {
    if (jsonOutput) {
      output.json({ items: [] });
    } else {
      output.print("INBOX is empty");
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
    output.json({ items: skillList });
  } else {
    output.print("Skills in INBOX:");
    output.println();
    for (const skill of skillList) {
      output.print(`  ${skill.name} (${skill.size})`);
    }
  }
}

async function showInboxSkill(
  skillName: string,
  context: ProgramContext,
): Promise<void> {
  const { output, debug } = context;
  const inboxDir = getInboxDir();
  const skillDir = join(inboxDir, skillName);
  const skillMdPath = join(skillDir, "SKILL.md");

  if (debug) {
    output.print(`Showing skill: ${skillName} at ${skillDir}`);
  }

  if (!existsSync(skillDir)) {
    output.error(`Skill '${skillName}' not found in INBOX`);
    process.exit(1);
  }

  if (!existsSync(skillMdPath)) {
    output.error("Invalid skill directory (missing SKILL.md)");
    return;
  }

  const content = readFileSync(skillMdPath, "utf-8");
  console.log(content);

  output.print("Directory Structure:");
  const tree = buildDirectoryTree(skillDir);
  console.log(tree);
}

async function removeInboxSkill(
  skillName: string,
  context: ProgramContext,
): Promise<void> {
  const { output, debug } = context;
  const inboxDir = getInboxDir();
  const skillDir = join(inboxDir, skillName);

  if (debug) {
    output.print(`Removing skill: ${skillName} from ${skillDir}`);
  }

  if (!existsSync(skillDir)) {
    output.error(`Skill '${skillName}' not found in INBOX`);
    process.exit(1);
  }

  rmSync(skillDir, { recursive: true, force: true });
  output.print(`Skill '${skillName}' removed from INBOX`);
}

const listSubcommand: SubCommandDefinition = {
  name: "list",
  description: "List all skills in INBOX",
  options: [{ flags: "--json", description: "Output in JSON format" }],
  action: async (_args, options, context) => {
    try {
      await listInboxSkills(options.json as boolean, context);
    } catch (error) {
      handleCommandError(error);
    }
  },
  helpText: {
    examples: [
      "wopal inbox list                # List all INBOX skills",
      "wopal inbox list --json         # JSON output",
    ],
    notes: [
      "Skills stored in INBOX after download",
      "Use 'wopal inbox show' to view details",
    ],
  },
};

const showSubcommand: SubCommandDefinition = {
  name: "show <skill>",
  description: "Show skill details (SKILL.md content and directory structure)",
  action: async (args, _options, context) => {
    try {
      const skillName = args.arg0 as string;
      await showInboxSkill(skillName, context);
    } catch (error) {
      handleCommandError(error);
    }
  },
  helpText: {
    examples: ["wopal inbox show my-skill       # Show skill details"],
    notes: ["Displays SKILL.md content and directory structure"],
  },
};

const removeSubcommand: SubCommandDefinition = {
  name: "remove <skill>",
  description: "Remove a single skill from INBOX",
  action: async (args, _options, context) => {
    try {
      const skillName = args.arg0 as string;
      await removeInboxSkill(skillName, context);
    } catch (error) {
      handleCommandError(error);
    }
  },
  helpText: {
    examples: ["wopal inbox remove my-skill     # Remove from INBOX"],
    notes: ["Permanently deletes the skill from INBOX"],
  },
};

export const inboxSubcommands: SubCommandDefinition[] = [
  listSubcommand,
  showSubcommand,
  removeSubcommand,
];

export const inboxGroupHelpText = {
  examples: [
    "wopal inbox list                # List INBOX skills",
    "wopal inbox show my-skill       # Show skill details",
    "wopal inbox remove my-skill     # Remove from INBOX",
  ],
  workflow: [
    "Download: wopal skills download <source>",
    "Review: wopal inbox show <skill-name>",
    "Scan: wopal skills scan <skill-name>",
    "Install: wopal skills install <skill-name>",
  ],
};
