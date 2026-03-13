import type { ModuleEntry, SubCommandDefinition } from "../program/types.js";
import { registerCommandGroup } from "../program/command-registry.js";
import { handleCommandError, CommandError } from "../lib/error-utils.js";
import { invalidateConfigInstance } from "../lib/config.js";

const listSubcommand: SubCommandDefinition = {
  name: "list",
  description: "List all registered spaces",
  options: [{ flags: "--json", description: "Output as JSON" }],
  action: async (_args, options, context) => {
    try {
      const { output, config } = context;
      const spaces = config.listSpaces();

      if (options.json) {
        output.json({ spaces });
        return;
      }

      if (spaces.length === 0) {
        output.print("No spaces registered");
        output.print("Run 'wopal init' to create a space");
        return;
      }

      const nameWidth = Math.max(...spaces.map((s) => s.name.length), 12);
      const header = `${"SPACE".padEnd(nameWidth + 2)}PATH`;
      output.print(header);
      for (const space of spaces) {
        const marker = space.active ? " *" : "  ";
        output.print(`${space.name.padEnd(nameWidth)}${marker}  ${space.path}`);
      }
      output.println();
      output.print("* = active space");
    } catch (error) {
      handleCommandError(error);
    }
  },
  helpText: {
    examples: ["wopal space list    # List all spaces"],
  },
};

const addSubcommand: SubCommandDefinition = {
  name: "add <name> [path]",
  description: "Add a new space",
  options: [{ flags: "--json", description: "Output as JSON" }],
  action: async (args, options, context) => {
    try {
      const { output, config } = context;
      const name = args.arg0 as string;
      const path = (args.arg1 as string) || process.cwd();

      config.addSpace(name, path);
      invalidateConfigInstance();
      const freshConfig = context.config;
      const space = freshConfig.listSpaces().find((s) => s.name === name);

      if (options.json) {
        output.json({ success: true, space });
        return;
      }

      output.print(`Space '${name}' added`);
      output.print(`Path: ${space?.path}`);
      output.print(`Active: ${space?.active}`);
    } catch (error) {
      throw new CommandError({
        code: "SPACE_ADD_FAILED",
        message: error instanceof Error ? error.message : String(error),
        suggestion: "Check if the space name already exists or path is valid",
      });
    }
  },
};

const removeSubcommand: SubCommandDefinition = {
  name: "remove <name>",
  description: "Remove a space",
  options: [{ flags: "--json", description: "Output as JSON" }],
  action: async (args, options, context) => {
    try {
      const { output, config } = context;
      const name = args.arg0 as string;

      config.removeSpace(name);
      invalidateConfigInstance();

      if (options.json) {
        output.json({ success: true, removed: name });
        return;
      }

      output.print(`Space '${name}' removed`);
    } catch (error) {
      throw new CommandError({
        code: "SPACE_REMOVE_FAILED",
        message: error instanceof Error ? error.message : String(error),
        suggestion: "Use 'wopal space list' to see available spaces",
      });
    }
  },
};

const useSubcommand: SubCommandDefinition = {
  name: "use <name>",
  description: "Set active space",
  options: [{ flags: "--json", description: "Output as JSON" }],
  action: async (args, options, context) => {
    try {
      const { output, config } = context;
      const name = args.arg0 as string;

      config.setActiveSpace(name);
      invalidateConfigInstance();
      const space = config.listSpaces().find((s) => s.name === name);

      if (options.json) {
        output.json({ success: true, activeSpace: name, space });
        return;
      }

      output.print(`Switched to space '${name}'`);
      output.print(`Path: ${space?.path}`);
    } catch (error) {
      throw new CommandError({
        code: "SPACE_USE_FAILED",
        message: error instanceof Error ? error.message : String(error),
        suggestion: "Use 'wopal space list' to see available spaces",
      });
    }
  },
};

const showSubcommand: SubCommandDefinition = {
  name: "show [name]",
  description: "Show space details",
  options: [{ flags: "--json", description: "Output as JSON" }],
  action: async (args, options, context) => {
    try {
      const { output, config } = context;
      const name = args.arg0 as string | undefined;

      const targetName =
        name ?? config.listSpaces().find((s) => s.active)?.name;

      if (!targetName) {
        throw new CommandError({
          code: "NO_ACTIVE_SPACE",
          message: "No active space",
          suggestion:
            "Run 'wopal init' to create a space, or use 'wopal space use <name>'",
        });
      }

      const spaces = config.listSpaces();
      const space = spaces.find((s) => s.name === targetName);

      if (!space) {
        throw new CommandError({
          code: "SPACE_NOT_FOUND",
          message: `Space '${targetName}' not found`,
          suggestion: "Use 'wopal space list' to see available spaces",
        });
      }

      const skillsDir = config.getSkillsDir(targetName);
      const skillsInboxDir = config.getSkillsInboxDir(targetName);
      const lockFile = config.getSpaceLockPath(targetName);

      if (options.json) {
        output.json({
          name: space.name,
          path: space.path,
          skillsDir,
          skillsInboxDir,
          lockFile,
          active: space.active,
        });
        return;
      }

      output.print(`Space: ${space.name}`);
      output.print(`Path: ${space.path}`);
      output.print(`Skills Dir: ${skillsDir}`);
      output.print(`INBOX Dir: ${skillsInboxDir}`);
      output.print(`Lock File: ${lockFile}`);
      output.print(`Active: ${space.active}`);
    } catch (error) {
      handleCommandError(error);
    }
  },
};

const spaceGroupDef = {
  name: "space",
  description: "Manage workspace spaces",
  subcommands: [
    listSubcommand,
    addSubcommand,
    removeSubcommand,
    useSubcommand,
    showSubcommand,
  ],
  helpText: {
    examples: [
      "wopal space list              # List all spaces",
      "wopal space add my-project    # Add current directory as space",
      "wopal space add my-project /path/to/dir  # Add specific path",
      "wopal space use my-project    # Switch to space",
      "wopal space remove my-project # Remove space",
      "wopal space show              # Show active space details",
    ],
    notes: [
      "Spaces are stored in ~/.wopal/config/settings.jsonc",
      "Active space determines skill directories",
      "Use --space <name> flag to run any command in a different space",
    ],
  },
};

export const spaceCommand: ModuleEntry = {
  type: "module",
  id: "space",
  description: "Manage workspace spaces",
  register: ({ program, context }) => {
    registerCommandGroup(program, spaceGroupDef, context);
  },
};
