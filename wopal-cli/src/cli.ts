#!/usr/bin/env node
import { Command } from "commander";
import { loadEnv } from "./lib/env-loader.js";
import { Logger } from "./lib/logger.js";
import { checkInitialization } from "./lib/init-check.js";
import { handleCommandError } from "./lib/error-utils.js";
import { hasHelpOrVersion, getPrimaryCommand } from "./argv.js";
import { tryRouteCli, getVersion } from "./route.js";
import { registerSubCliByName } from "./program/register-subclis.js";
import {
  registerInitCommand,
  setLogger as setInitLogger,
} from "./commands/init.js";
import {
  registerSkillsCli,
  setLogger as setSkillsLogger,
} from "./commands/skills/index.js";
import { setLogger as setScannerLogger } from "./scanner/scanner.js";
import { setLogger as setIOCLogger } from "./scanner/ioc-loader.js";
import { setLogger as setWhitelistLogger } from "./scanner/whitelist.js";
import { setLogger as setScannerUtilsLogger } from "./scanner/scanner-utils.js";

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
      setScannerLogger(logger);
      setIOCLogger(logger);
      setWhitelistLogger(logger);
      setScannerUtilsLogger(logger);

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
  if (primary && !hasHelpOrVersion(argv)) {
    if (primary === "skills") {
      registerSkillsCli(program);
    }
  } else {
    program
      .command("skills")
      .description("Manage AI agent skills")
      .allowUnknownOption(true)
      .allowExcessArguments(true)
      .action(async (...actionArgs) => {
        const commands = program.commands as Command[];
        const skillsCmd = commands.find((cmd) => cmd.name() === "skills");
        if (skillsCmd) {
          const index = commands.indexOf(skillsCmd);
          if (index >= 0) {
            commands.splice(index, 1);
          }
        }
        registerSkillsCli(program);
        const actionCommand = actionArgs.at(-1) as Command | undefined;
        const rawArgs = (program as Command & { rawArgs?: string[] }).rawArgs;
        const actionArgsList: string[] = [];
        const options = actionCommand?.opts() || {};
        for (const [, value] of Object.entries(options)) {
          if (typeof value === "string") {
            actionArgsList.push(value);
          }
        }
        const fallbackArgv = actionCommand?.name()
          ? [actionCommand.name(), ...actionArgsList]
          : actionArgsList;
        const parseArgv = rawArgs || [
          "node",
          "wopal",
          "skills",
          ...fallbackArgv,
        ];
        await program.parseAsync(parseArgv);
      });
  }

  await program.parseAsync(argv);
}

runCli().catch((error) => {
  console.error(error);
  process.exit(1);
});
