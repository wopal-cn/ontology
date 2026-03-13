#!/usr/bin/env node
import { Command } from "commander";
import { loadEnv } from "./lib/env-loader.js";
import { Logger } from "./lib/logger.js";
import { checkInitialization } from "./lib/init-check.js";
import { handleCommandError } from "./lib/error-utils.js";
import { getPrimaryCommand } from "./argv.js";
import { tryRouteCli, getVersion } from "./route.js";
import { buildHelpText, buildHelpHeader } from "./lib/help-texts.js";
import { getConfig } from "./lib/config.js";
import {
  registerInitCommand,
  setLogger as setInitLogger,
} from "./commands/init.js";
import {
  registerSkillsCli,
  setLogger as setSkillsLogger,
} from "./commands/skills/index.js";
import { setLogger as setOpenclawUpdaterLogger } from "./scanner/openclaw-updater.js";
import { setLogger as setOpenclawWrapperLogger } from "./scanner/openclaw-wrapper.js";
import { registerSpaceCommand } from "./commands/space.js";

async function runCli(argv: string[] = process.argv): Promise<void> {
  if (await tryRouteCli(argv)) {
    return;
  }

  const program = new Command();
  const version = getVersion();

  program
    .name("wopal")
    .description("Universal toolbox for wopal agents")
    .version(version, "-v, --version", "Show version number")
    .option("-d, --debug", "Enable debug mode")
    .option("--space <name>", "Specify workspace scope (overrides activeSpace)")
    .addHelpCommand(false)
    .hook("preAction", (thisCommand, actionCommand) => {
      const options = thisCommand.opts();
      const debug = options.debug || false;
      const spaceOverride: string | undefined = options.space;

      // Phase 1: 加载配置（不加载 .env）
      const config = getConfig(debug);

      // 确定目标空间路径（--space 参数优先于 activeSpace）
      const targetSpacePath = config.getEffectiveSpacePath(spaceOverride);

      // Phase 2: 基于目标空间加载环境变量
      config.loadEnvForSpace(targetSpacePath);

      const logger = new Logger(debug);
      setInitLogger(logger);
      setSkillsLogger(logger);
      setOpenclawUpdaterLogger(logger);
      setOpenclawWrapperLogger(logger);

      logger.log("Debug mode enabled");

      // --space 参数校验：如果指定了 space 但不存在，给出明确错误
      if (spaceOverride && !config.getEffectiveSpace(spaceOverride)) {
        const available = Object.keys(config.getAllSpaces()).join(", ");
        console.error(`Error: Space '${spaceOverride}' not found`);
        if (available) {
          console.error(`Available spaces: ${available}`);
        }
        console.error(`Use 'wopal space list' to see available spaces`);
        process.exit(1);
      }

      const commandName = actionCommand.name();
      if (commandName !== "init" && commandName !== "space") {
        try {
          checkInitialization();
        } catch (error) {
          handleCommandError(error);
        }
      }
    });

  program.addHelpText("before", () => {
    const config = getConfig();
    return buildHelpHeader(config.getActiveSpace());
  });

  program.addHelpText(
    "after",
    buildHelpText({
      examples: [
        "wopal init                          # Initialize workspace",
        "wopal space list                    # List all spaces",
        "wopal skills list                   # List all skills",
        "wopal --space project-a skills list # Run command in a specific space",
        "wopal skills --help                 # Show skills help",
      ],
      notes: ["Run 'wopal <command> --help' for command details"],
    }),
  );

  registerInitCommand(program);
  registerSpaceCommand(program);

  const primary = getPrimaryCommand(argv);
  if (primary === null || primary === "skills") {
    registerSkillsCli(program);
  }

  await program.parseAsync(argv);
}

runCli().catch((error) => {
  console.error(error);
  process.exit(1);
});
