import { Command } from 'commander';
import { getConfig } from '../lib/config.js';
import { Logger } from '../lib/logger.js';
import { resolve } from 'path';
import pc from 'picocolors';
import { homedir } from 'os';
import { existsSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { buildHelpText } from '../lib/help-texts.js';

let logger: Logger;

export function setLogger(l: Logger): void {
  logger = l;
}

export function registerInitCommand(program: Command): void {
  const command = program
    .command('init [space-name] [space-dir]')
    .description('Initialize a new wopal workspace')
    .action((spaceName?: string, spaceDir?: string) => {
      let finalName = 'main';
      let finalDir = process.cwd();

      if (spaceName && spaceDir) {
        finalName = spaceName;
        finalDir = spaceDir;
      } else if (spaceName && !spaceDir) {
        if (
          spaceName === '.' ||
          spaceName.startsWith('/') ||
          spaceName.startsWith('~') ||
          spaceName.startsWith('./') ||
          spaceName.startsWith('../')
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

      logger.info(`Initializing workspace [${finalName}] at: ${expandedDir}`);

      try {
        const configService = getConfig();
        configService.addSpace(finalName, expandedDir);

        const wopalGlobalEnv = join(homedir(), '.wopal', '.env');
        if (!existsSync(join(homedir(), '.wopal'))) {
          mkdirSync(join(homedir(), '.wopal'), { recursive: true });
        }
        if (!existsSync(wopalGlobalEnv)) {
          writeFileSync(wopalGlobalEnv, '', 'utf-8');
        }

        const spaceEnv = join(expandedDir, '.env');
        if (!existsSync(spaceEnv)) {
          if (!existsSync(expandedDir)) {
            mkdirSync(expandedDir, { recursive: true });
          }
          writeFileSync(spaceEnv, '', 'utf-8');
        }

        console.log(pc.green(`✓ Initialized workspace [${finalName}]`));
        console.log();
        console.log(pc.cyan('Configuration:'));
        console.log(pc.gray(`  Space: ${expandedDir}`));
        console.log(pc.gray(`  Config: ~/.wopal/config/settings.jsonc`));
        console.log(pc.gray(`  IOC DB: ~/.wopal/skills/iocdb (default)`));
        console.log();
        console.log(pc.cyan('Next steps:'));
        console.log(pc.gray('  Initialize IOC database (required):'));
        console.log(pc.gray('    git submodule update --init'));
      } catch (error) {
        let errMessage = error instanceof Error ? error.message : String(error);
        console.error(pc.red(`Error: ${errMessage}`));
        logger.error(`Init failed: ${errMessage}`);
        process.exit(1);
      }
    });

  command.addHelpText(
    'after',
    buildHelpText({
      examples: [
        "# Initialize current directory as 'main' workspace\nwopal init",
        "# Initialize current directory with custom name\nwopal init my-project",
        '# Initialize specific directory\nwopal init my-project /path/to/workspace',
        '# Initialize using relative path\nwopal init .',
        '# Initialize using home path\nwopal init ~/my-workspace',
      ],
      options: [
        "[space-name]       Workspace name (default: 'main')",
        '[space-dir]        Workspace directory (default: current directory)',
        '--help             Show this help message',
      ],
      notes: [
        'Creates .wopalrc configuration if not exists',
        'Creates .env file in workspace directory',
        'Creates ~/.wopal/.env for global settings',
        'Supports ~ expansion for home directory',
      ],
    }),
  );
}
