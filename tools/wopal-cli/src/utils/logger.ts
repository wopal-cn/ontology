import { appendFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

export class Logger {
  private debug: boolean;
  private logDir: string;

  constructor(debug: boolean = false) {
    this.debug = debug;
    this.logDir = join(process.cwd(), 'logs');
  }

  log(message: string): void {
    if (!this.debug) return;

    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] ${message}\n`;

    console.log(logLine.trim());

    if (!existsSync(this.logDir)) {
      mkdirSync(this.logDir, { recursive: true });
    }

    appendFileSync(join(this.logDir, 'wopal-cli.log'), logLine);
  }

  error(message: string): void {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] ERROR: ${message}\n`;

    console.error(logLine.trim());

    if (this.debug) {
      if (!existsSync(this.logDir)) {
        mkdirSync(this.logDir, { recursive: true });
      }
      appendFileSync(join(this.logDir, 'wopal-cli.log'), logLine);
    }
  }
}
