#!/usr/bin/env node
import { Command } from "commander";
import pc from "picocolors";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { loadEnv } from "./utils/env-loader.js";
import { Logger } from "./utils/logger.js";
import {
  registerInboxCommand,
  setLogger as setInboxLogger,
} from "./commands/inbox.js";
import {
  registerListCommand,
  setLogger as setListLogger,
} from "./commands/list.js";
import {
  registerPassthroughCommand,
  setLogger as setPassthroughLogger,
} from "./commands/passthrough.js";
import {
  registerDownloadCommand,
  setLogger as setDownloadLogger,
} from "./commands/download.js";
import {
  registerScanCommand,
  setLogger as setScanLogger,
} from "./commands/scan.js";
import { setLogger as setScannerLogger } from "./scanner/scanner.js";
import { setLogger as setIOCLogger } from "./scanner/ioc-loader.js";
import { setLogger as setWhitelistLogger } from "./scanner/whitelist.js";
import { setLogger as setScannerUtilsLogger } from "./scanner/scanner-utils.js";
import { createInstallCommand } from "./commands/install.js";
import {
  registerCheckCommand,
  setLogger as setCheckLogger,
} from "./commands/check.js";
import {
  registerInitCommand,
  setLogger as setInitLogger,
} from "./commands/init.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function getVersion(): string {
  const packageJsonPath = join(__dirname, "..", "package.json");
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
  return packageJson.version;
}

function findCommand(cmd: Command, names: string[]): Command | null {
  if (names.length === 0) return cmd;
  const [name, ...rest] = names;
  const sub = cmd.commands.find((c) => c.name() === name);
  if (!sub) return null;
  return findCommand(sub, rest);
}

const program = new Command();

program
  .name("wopal")
  .description("Universal toolbox for wopal agents")
  .version(getVersion(), "-v, --version", "Show version number")
  .option("-d, --debug", "Enable debug mode")
  .hook("preAction", (thisCommand) => {
    const options = thisCommand.opts();
    const debug = options.debug || false;

    loadEnv(debug);

    const logger = new Logger(debug);
    setInboxLogger(logger);
    setListLogger(logger);
    setPassthroughLogger(logger);
    setDownloadLogger(logger);
    setScanLogger(logger);
    setScannerLogger(logger);
    setIOCLogger(logger);
    setWhitelistLogger(logger);
    setScannerUtilsLogger(logger);
    setCheckLogger(logger);
    setInitLogger(logger);

    logger.log("Debug mode enabled");
  });

const skillsCommand = program
  .command("skills")
  .description("Manage AI agent skills");

registerInitCommand(program);

registerInboxCommand(skillsCommand);
registerListCommand(skillsCommand);
registerPassthroughCommand(skillsCommand);
registerDownloadCommand(skillsCommand);
registerScanCommand(skillsCommand);
registerCheckCommand(skillsCommand);
skillsCommand.addCommand(createInstallCommand());

program
  .command("help [command...]")
  .description("Display help for command")
  .action((commandNames) => {
    if (!commandNames || commandNames.length === 0) {
      program.outputHelp();
      return;
    }
    const cmd = findCommand(program, commandNames);
    if (cmd) {
      cmd.outputHelp();
    } else {
      console.error(pc.red(`Unknown command: ${commandNames.join(" ")}`));
      process.exit(1);
    }
  });

program.parse();
