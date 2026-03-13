import type {
  ModuleEntry,
  CommandGroupDefinition,
} from "../../program/types.js";
import { registerCommandGroup } from "../../program/command-registry.js";
import { listSubcommand } from "./list.js";
import { downloadSubcommand } from "./download.js";
import { scanSubcommand } from "./scan.js";
import { checkSubcommand } from "./check.js";
import { installSubcommand } from "./install.js";
import { inboxSubcommands } from "./inbox.js";
import { updateScannerSubcommand } from "./update-scanner.js";
import { findSubcommand } from "./find.js";

export const skillsCommand: ModuleEntry = {
  type: "module",
  id: "skills",
  description: "Manage AI agent skills",
  register: ({ program, context }) => {
    const inboxGroupDef: CommandGroupDefinition = {
      name: "inbox",
      description: "Manage skills in INBOX (downloaded but not yet installed)",
      subcommands: inboxSubcommands,
      helpText: {
        examples: [
          "wopal skills inbox list        # List INBOX skills",
          "wopal skills inbox show <name> # Show skill details",
          "wopal skills inbox remove <name> # Remove from INBOX",
        ],
        workflow: [
          "Download: wopal skills download <source>",
          "Review: wopal skills inbox show <skill-name>",
          "Scan: wopal skills scan <skill-name>",
          "Install: wopal skills install <skill-name>",
        ],
      },
    };

    const skillsGroupDef: CommandGroupDefinition = {
      name: "skills",
      description: "Manage AI agent skills",
      subcommands: [
        listSubcommand,
        downloadSubcommand,
        scanSubcommand,
        checkSubcommand,
        installSubcommand,
        updateScannerSubcommand,
        findSubcommand,
      ],
      helpText: {
        workflow: [
          "Download: wopal skills download <source>",
          "Scan: wopal skills scan <skill-name>",
          "Install: wopal skills install <skill-name>",
        ],
      },
    };

    registerCommandGroup(program, skillsGroupDef, context);

    const skillsCmd = program.commands.find((cmd) => cmd.name() === "skills");
    if (skillsCmd) {
      registerCommandGroup(skillsCmd, inboxGroupDef, context);
    }
  },
};
