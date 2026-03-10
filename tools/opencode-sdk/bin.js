#!/usr/bin/env node
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const tsxPath = join(__dirname, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const cliPath = join(__dirname, 'cli', 'index.ts');

spawn(process.execPath, [tsxPath, cliPath, ...process.argv.slice(2)], {
  stdio: 'inherit',
  shell: false
}).on('exit', (code) => {
  process.exit(code || 0);
});