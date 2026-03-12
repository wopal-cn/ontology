import type { Command } from 'commander';

export function resolveActionArgs(actionCommand: Command | undefined): string[] {
  if (!actionCommand) {
    return [];
  }
  const args: string[] = [];
  const options = actionCommand.opts();
  for (const [, value] of Object.entries(options)) {
    if (typeof value === 'string') {
      args.push(value);
    }
  }
  return args;
}
