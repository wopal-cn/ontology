#!/usr/bin/env node
import { Command } from 'commander';
import pc from 'picocolors';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { loadEnv } from './utils/env-loader.js';
import { Logger } from './utils/logger.js';
import { registerInboxCommand, setLogger as setInboxLogger } from './commands/inbox.js';
import { registerListCommand, setLogger as setListLogger } from './commands/list.js';
import { registerPassthroughCommand, setLogger as setPassthroughLogger } from './commands/passthrough.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function getVersion(): string {
  const packageJsonPath = join(__dirname, '..', 'package.json');
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
  return packageJson.version;
}

const program = new Command();

program
  .name('wopal')
  .description('Wopal Skills CLI - Manage AI agent skills with INBOX workflow')
  .version(getVersion(), '-v, --version', 'Show version number')
  .option('-d, --debug', 'Enable debug mode')
  .hook('preAction', (thisCommand) => {
    const options = thisCommand.opts();
    const debug = options.debug || false;

    loadEnv(debug);

    const logger = new Logger(debug);
    setInboxLogger(logger);
    setListLogger(logger);
    setPassthroughLogger(logger);

    logger.log('Debug mode enabled');
    logger.log(`INBOX directory: ${process.env.SKILL_INBOX_DIR || '~/.wopal/skills/INBOX'}`);
  });

program
  .command('skills')
  .description('Manage AI agent skills')
  .action(() => {
    program.help();
  });

registerInboxCommand(program);
registerListCommand(program);
registerPassthroughCommand(program);

program.parse();
