import { Command } from "commander";
import { getConfig, invalidateConfigInstance } from "../lib/config.js";
import { buildHelpText, buildHelpHeader } from "../lib/help-texts.js";
import { CommandError, handleCommandError } from "../lib/error-utils.js";
import { Logger } from "../lib/logger.js";

let logger: Logger = new Logger(false);

export function setLogger(l: Logger): void {
  logger = l;
}

export function registerSpaceCommand(program: Command): void {
  const spaceCommand = new Command("space")
    .description("Manage workspace spaces")
    .addHelpCommand(false);

  spaceCommand.addHelpText("before", () => {
    return buildHelpHeader(getConfig().getActiveSpace());
  });

  spaceCommand.addHelpText(
    "after",
    buildHelpText({
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
    }),
  );

  spaceCommand
    .command("list")
    .description("List all registered spaces")
    .option("--json", "Output as JSON")
    .action((options) => {
      try {
        listSpaces(options.json);
      } catch (error) {
        handleCommandError(error);
      }
    });

  spaceCommand
    .command("add <name> [path]")
    .description("Add a new space")
    .option("--json", "Output as JSON")
    .action(
      (name: string, path: string | undefined, options: { json?: boolean }) => {
        try {
          addSpace(name, path, options.json);
        } catch (error) {
          handleCommandError(error);
        }
      },
    );

  spaceCommand
    .command("remove <name>")
    .description("Remove a space")
    .option("--json", "Output as JSON")
    .action((name: string, options: { json?: boolean }) => {
      try {
        removeSpace(name, options.json);
      } catch (error) {
        handleCommandError(error);
      }
    });

  spaceCommand
    .command("use <name>")
    .description("Set active space")
    .option("--json", "Output as JSON")
    .action((name: string, options: { json?: boolean }) => {
      try {
        useSpace(name, options.json);
      } catch (error) {
        handleCommandError(error);
      }
    });

  spaceCommand
    .command("show [name]")
    .description("Show space details")
    .option("--json", "Output as JSON")
    .action((name: string | undefined, options: { json?: boolean }) => {
      try {
        showSpace(name, options.json);
      } catch (error) {
        handleCommandError(error);
      }
    });

  program.addCommand(spaceCommand);
}

function listSpaces(json?: boolean): void {
  const config = getConfig();
  const spaces = config.listSpaces();

  if (json) {
    console.log(JSON.stringify({ spaces }, null, 2));
    return;
  }

  if (spaces.length === 0) {
    console.log("No spaces registered");
    console.log("Run 'wopal init' to create a space");
    return;
  }

  const nameWidth = Math.max(...spaces.map((s) => s.name.length), 12);
  const header = `${"SPACE".padEnd(nameWidth + 2)}PATH`;
  console.log(header);
  for (const space of spaces) {
    const marker = space.active ? " *" : "  ";
    console.log(`${space.name.padEnd(nameWidth)}${marker}  ${space.path}`);
  }
  console.log("\n* = active space");
}

function addSpace(
  name: string,
  path: string | undefined,
  json?: boolean,
): void {
  const config = getConfig();
  const targetPath = path || process.cwd();

  try {
    config.addSpace(name, targetPath);
    // 写入后刷新单例，确保后续命令读取最新配置
    invalidateConfigInstance();
    const freshConfig = getConfig();
    const space = freshConfig.listSpaces().find((s) => s.name === name);

    if (json) {
      console.log(JSON.stringify({ success: true, space }, null, 2));
      return;
    }

    console.log(`Space '${name}' added`);
    console.log(`Path: ${space?.path}`);
    console.log(`Active: ${space?.active}`);
  } catch (error) {
    throw new CommandError({
      code: "SPACE_ADD_FAILED",
      message: error instanceof Error ? error.message : String(error),
      suggestion: "Check if the space name already exists or path is valid",
    });
  }
}

function removeSpace(name: string, json?: boolean): void {
  const config = getConfig();

  try {
    config.removeSpace(name);
    invalidateConfigInstance();

    if (json) {
      console.log(JSON.stringify({ success: true, removed: name }, null, 2));
      return;
    }

    console.log(`Space '${name}' removed`);
  } catch (error) {
    throw new CommandError({
      code: "SPACE_REMOVE_FAILED",
      message: error instanceof Error ? error.message : String(error),
      suggestion: "Use 'wopal space list' to see available spaces",
    });
  }
}

function useSpace(name: string, json?: boolean): void {
  const config = getConfig();

  try {
    config.setActiveSpace(name);
    invalidateConfigInstance();
    const freshConfig = getConfig();
    const space = freshConfig.listSpaces().find((s) => s.name === name);

    if (json) {
      console.log(
        JSON.stringify({ success: true, activeSpace: name, space }, null, 2),
      );
      return;
    }

    console.log(`Switched to space '${name}'`);
    console.log(`Path: ${space?.path}`);
  } catch (error) {
    throw new CommandError({
      code: "SPACE_USE_FAILED",
      message: error instanceof Error ? error.message : String(error),
      suggestion: "Use 'wopal space list' to see available spaces",
    });
  }
}

function showSpace(name: string | undefined, json?: boolean): void {
  const config = getConfig();

  // 修复：明确括号确保 undefined-coalescence 与三元运算符优先级正确
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

  // 从 ConfigService 获取完整路径信息
  const skillsDir = config.getSkillsDir(targetName);
  const skillsInboxDir = config.getSkillsInboxDir(targetName);
  const lockFile = config.getSpaceLockPath(targetName);

  if (json) {
    console.log(
      JSON.stringify(
        {
          name: space.name,
          path: space.path,
          skillsDir,
          skillsInboxDir,
          lockFile,
          active: space.active,
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(`Space: ${space.name}`);
  console.log(`Path: ${space.path}`);
  console.log(`Skills Dir: ${skillsDir}`);
  console.log(`INBOX Dir: ${skillsInboxDir}`);
  console.log(`Lock File: ${lockFile}`);
  console.log(`Active: ${space.active}`);
}
