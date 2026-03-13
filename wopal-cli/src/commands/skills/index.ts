import type { Command } from "commander";
import { Logger } from "../../lib/logger.js";
import { buildHelpHeader } from "../../lib/help-texts.js";
import { getConfig } from "../../lib/config.js";
import { registerInboxCommand, setLogger as setInboxLogger } from "./inbox.js";
import { registerListCommand, setLogger as setListLogger } from "./list.js";
import {
  registerPassthroughCommand,
  setLogger as setPassthroughLogger,
} from "./passthrough.js";
import {
  registerDownloadCommand,
  setLogger as setDownloadLogger,
} from "./download.js";
import { registerScanCommand, setLogger as setScanLogger } from "./scan.js";
import { registerCheckCommand, setLogger as setCheckLogger } from "./check.js";
import {
  registerUpdateScannerCommand,
  setLogger as setUpdateScannerLogger,
} from "./update-scanner.js";
import { createInstallCommand } from "./install.js";

let logger: Logger;

export function setLogger(l: Logger): void {
  logger = l;
  setInboxLogger(l);
  setListLogger(l);
  setPassthroughLogger(l);
  setDownloadLogger(l);
  setScanLogger(l);
  setCheckLogger(l);
  setUpdateScannerLogger(l);
}

export function registerSkillsCli(program: Command): void {
  const skillsCommand = program
    .command("skills")
    .description("Manage AI agent skills")
    .addHelpCommand(false);

  skillsCommand.addHelpText("before", () => {
    const config = getConfig();
    return buildHelpHeader(config.getActiveSpace());
  });

  registerInboxCommand(skillsCommand);
  registerListCommand(skillsCommand);
  registerPassthroughCommand(skillsCommand);
  registerDownloadCommand(skillsCommand);
  registerScanCommand(skillsCommand);
  registerCheckCommand(skillsCommand);
  registerUpdateScannerCommand(skillsCommand);
  skillsCommand.addCommand(createInstallCommand());
}
