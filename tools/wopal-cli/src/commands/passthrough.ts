import { spawnSync } from 'child_process';
import { Command } from 'commander';
import pc from 'picocolors';
import { Logger } from '../utils/logger.js';

let logger: Logger;

export function setLogger(l: Logger): void {
  logger = l;
}

export function registerPassthroughCommand(program: Command): void {
  program
    .command('find [query]')
    .description('Search for skills (via Skills CLI)')
    .action(async (query?: string) => {
      await passthroughFind(query || '');
    });
}

async function passthroughFind(query: string): Promise<void> {
  logger?.log(`Passthrough find: ${query}`);

  const args = ['-y', 'skills', 'find'];
  if (query) {
    args.push(query);
  }

  const result = spawnSync('npx', args, {
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });

  if (result.error) {
    console.error(pc.red('Skills CLI 执行失败'));
    logger?.error(`Skills CLI error: ${result.error}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(pc.red('Skills CLI 执行失败'));
    process.exit(result.status || 1);
  }
}
