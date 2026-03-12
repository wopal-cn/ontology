import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { hasFlag, getCommandPath } from './argv.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function getVersion(): string {
  const packageJsonPath = join(__dirname, '..', 'package.json');
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
  return packageJson.version;
}

export function getHelpText(): string {
  return `wopal - Universal toolbox for wopal agents

Usage:
  wopal [options] [command]

Commands:
  init                      Initialize wopal configuration
  skills                    Manage AI agent skills

Options:
  -v, --version             Show version number
  -h, --help                Show this help message
  -d, --debug               Enable debug mode

Examples:
  wopal --version           Show version
  wopal init                Initialize configuration
  wopal skills list         List all skills
  wopal skills --help       Show skills help

For more information, run: wopal skills --help
`;
}

type RouteSpec = {
  match: (path: string[], argv: string[]) => boolean;
  run: (argv: string[]) => Promise<boolean>;
};

const routes: RouteSpec[] = [
  {
    match: (path, argv) => path.length === 0 && hasFlag(argv, '--version'),
    run: async () => {
      console.log(getVersion());
      return true;
    },
  },
  {
    match: (path, argv) => path.length === 0 && hasFlag(argv, '--help'),
    run: async () => {
      console.log(getHelpText());
      return true;
    },
  },
];

export async function tryRouteCli(argv: string[]): Promise<boolean> {
  const path = getCommandPath(argv, 2);
  for (const route of routes) {
    if (route.match(path, argv)) {
      return route.run(argv);
    }
  }
  return false;
}
