import type { Command } from 'commander';
import { getFlagValue, hasFlag } from '../argv.js';

export type CommandRegisterParams = {
  program: Command;
  argv: string[];
};

export type RouteSpec = {
  match: (path: string[]) => boolean;
  run: (argv: string[]) => Promise<boolean>;
};

export type CommandRegistration = {
  id: string;
  register: (params: CommandRegisterParams) => void;
  routes?: RouteSpec[];
};

export function findRoutedCommand(
  path: string[],
  registry: CommandRegistration[],
): RouteSpec | null {
  for (const entry of registry) {
    if (!entry.routes) {
      continue;
    }
    for (const route of entry.routes) {
      if (route.match(path)) {
        return route;
      }
    }
  }
  return null;
}

export { hasFlag, getFlagValue };
