import type { Command } from "commander";
import { Logger } from "../../lib/logger.js";
import { registerInboxCommand } from "./inbox.js";
import { registerListCommand } from "./list.js";
import { registerPassthroughCommand } from "./passthrough.js";
import { registerDownloadCommand } from "./download.js";
import { registerScanCommand } from "./scan.js";
import { registerCheckCommand } from "./check.js";
import { createInstallCommand } from "./install.js";

let logger: Logger;

export function setLogger(l: Logger): void {
  logger = l;
}

export function registerSkillsCli(program: Command): void {
  const skillsCommand = program
    .command("skills")
    .description("Manage AI agent skills")
    .addHelpCommand(false);

  registerInboxCommand(skillsCommand);
  registerListCommand(skillsCommand);
  registerPassthroughCommand(skillsCommand);
  registerDownloadCommand(skillsCommand);
  registerScanCommand(skillsCommand);
  registerCheckCommand(skillsCommand);
  skillsCommand.addCommand(createInstallCommand());
}
