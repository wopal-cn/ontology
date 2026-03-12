#!/usr/bin/env node
import { Command } from "commander";
import { loadEnv } from "./lib/env-loader.js";
import { Logger } from "./lib/logger.js";
import { checkInitialization } from "./lib/init-check.js";
import { handleCommandError } from "./lib/error-utils.js";
import { getPrimaryCommand } from "./argv.js";
import { tryRouteCli, getVersion } from "./route.js";
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
    .addHelpCommand(false)
    .hook("preAction", (thisCommand, actionCommand) => {
      const options = thisCommand.opts();
      const debug = options.debug || false;

      loadEnv(debug);

      const logger = new Logger(debug);
      setInitLogger(logger);
      setSkillsLogger(logger);
      setOpenclawUpdaterLogger(logger);
      setOpenclawWrapperLogger(logger);

      logger.log("Debug mode enabled");

      const commandName = actionCommand.name();
      if (commandName !== "init") {
        try {
          checkInitialization();
        } catch (error) {
          handleCommandError(error);
        }
      }
    });

  registerInitCommand(program);

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
