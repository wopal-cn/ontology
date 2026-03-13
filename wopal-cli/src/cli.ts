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
import { setLogger as setOpenclawUpdaterLogger } from "./scanner/openclaw-updater.js";
import { setLogger as setOpenclawWrapperLogger } from "./scanner/openclaw-wrapper.js";

import { initCommand } from "./commands/init.js";
import { spaceCommand } from "./commands/space.js";
import { skillsCommand } from "./commands/skills/index.js";
import {
  getCommandRegistry,
  createProgramContext,
  type ProgramContext,
} from "./program/index.js";
import { OutputService } from "./lib/output-service.js";
import { hasFlag } from "./argv.js";

async function runCli(argv: string[] = process.argv): Promise<void> {
  const version = getVersion();
  const debug = argv.includes("--debug") || argv.includes("-d");
  const config = getConfig(debug);

  OutputService.init(config);
  OutputService.reset();

  const context: ProgramContext = createProgramContext({
    version,
    debug,
    config,
    output: OutputService.get(),
  });

  if (hasFlag(argv, "--version") || hasFlag(argv, "-v")) {
    console.log(version);
    return;
  }

  const logger = new Logger(debug);
  setOpenclawUpdaterLogger(logger);
  setOpenclawWrapperLogger(logger);

  logger.log("Debug mode enabled");

  const registry = getCommandRegistry();
  registry.registerAll([initCommand, spaceCommand, skillsCommand]);

  const program = new Command();
  program
    .name("wopal")
    .description("Universal toolbox for wopal agents")
    .version(version, "-v, --version", "Show version number")
    .option("-d, --debug", "Enable debug mode")
    .option("--space <name>", "Specify workspace scope (overrides activeSpace)")
    .addHelpCommand(false)
    .hook("preAction", (thisCommand, actionCommand) => {
      OutputService.reset();

      const options = thisCommand.opts();
      const spaceOverride: string | undefined = options.space;
      const targetSpacePath = config.getEffectiveSpacePath(spaceOverride);

      config.loadEnvForSpace(targetSpacePath);

      const isHelp = argv.includes("--help") || argv.includes("-h");
      if (isHelp) {
        OutputService.get().setMode({ showHeader: false });
        return;
      }

      const actionOptions = actionCommand.opts();
      if (actionOptions.json) {
        OutputService.get().setMode({ showHeader: false });
      }

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

  await registry.registerAllToCommander(program, context);

  await program.parseAsync(argv);
}

runCli().catch((error) => {
  console.error(error);
  process.exit(1);
});
