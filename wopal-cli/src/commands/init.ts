import type { ModuleEntry, RegisterParams } from "../program/types.js";
import { buildHelpText } from "../lib/help-texts.js";
import { resolve } from "path";
import { homedir } from "os";
import { existsSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

async function initAction(
  args: Record<string, unknown>,
  _options: Record<string, unknown>,
  params: RegisterParams,
): Promise<void> {
  const { context } = params;
  const { output, config, debug } = context;

  let finalName = "main";
  let finalDir = process.cwd();

  const spaceName = args.arg0 as string | undefined;
  const spaceDir = args.arg1 as string | undefined;

  if (spaceName && spaceDir) {
    finalName = spaceName;
    finalDir = spaceDir;
  } else if (spaceName && !spaceDir) {
    if (
      spaceName === "." ||
      spaceName.startsWith("/") ||
      spaceName.startsWith("~") ||
      spaceName.startsWith("./") ||
      spaceName.startsWith("../")
    ) {
      finalDir = spaceName;
    } else {
      finalName = spaceName;
    }
  }

  const expandedDir = resolve(
    process.cwd(),
    finalDir.replace(/^~(?=$|\/|\\)/, homedir()),
  );

  if (debug) {
    console.error(
      `[DEBUG] Initializing workspace [${finalName}] at: ${expandedDir}`,
    );
  }

  try {
    config.addSpace(finalName, expandedDir);

    const wopalGlobalEnv = join(homedir(), ".wopal", ".env");
    if (!existsSync(join(homedir(), ".wopal"))) {
      mkdirSync(join(homedir(), ".wopal"), { recursive: true });
    }
    if (!existsSync(wopalGlobalEnv)) {
      writeFileSync(wopalGlobalEnv, "", "utf-8");
    }

    const spaceEnv = join(expandedDir, ".env");
    if (!existsSync(spaceEnv)) {
      if (!existsSync(expandedDir)) {
        mkdirSync(expandedDir, { recursive: true });
      }
      writeFileSync(spaceEnv, "", "utf-8");
    }

    output.print(`Initialized workspace [${finalName}]`);
    output.println();
    output.print("Configuration:");
    output.print(`  Space: ${expandedDir}`);
    output.print(`  Config: ~/.wopal/config/settings.jsonc`);
    output.println();
    output.print("Next steps:");
    output.print("  Download a skill:");
    output.print("    wopal skills download owner/repo@skill-name");
    output.print("  List downloaded skills:");
    output.print("    wopal skills inbox list");
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : String(error);
    output.error(errMessage);
    process.exit(1);
  }
}

export const initCommand: ModuleEntry = {
  type: "module",
  id: "init",
  description: "Initialize a new wopal workspace",
  register: ({ program, context }) => {
    program
      .command("init [space-name] [space-dir]")
      .description("Initialize a new wopal workspace")
      .action(async (...args) => {
        const options = args.pop();
        const positionalArgs = { arg0: args[0], arg1: args[1] };
        try {
          await initAction(positionalArgs, options as Record<string, unknown>, {
            program,
            context,
          });
        } catch (error) {
          console.error(error);
          process.exit(1);
        }
      })
      .addHelpText(
        "after",
        buildHelpText({
          examples: [
            "wopal init                    # Initialize current directory as main",
            "wopal init my-project         # Initialize with custom name",
            "wopal init . /path/to/ws      # Initialize specific directory",
            "wopal init ~/my-workspace     # Initialize using home path",
          ],
          notes: [
            "Creates .env file in workspace directory",
            "Creates ~/.wopal/.env for global settings",
            "Supports ~ expansion for home directory",
          ],
        }),
      );
  },
};
