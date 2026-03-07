import { appendFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

export class Logger {
  private isDebug: boolean;
  private logDir: string;

  constructor(debug: boolean = false) {
    this.isDebug = debug;
    this.logDir = join(process.cwd(), 'logs');
  }

  log(message: string): void {
    if (!this.isDebug) return;
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] [DEBUG] ${message}\n`;

    if (!existsSync(this.logDir)) {
      mkdirSync(this.logDir, { recursive: true });
    }

    appendFileSync(join(this.logDir, 'wopal-cli.log'), logLine);
  }

  debug(message: string, data?: any): void {
    if (!this.isDebug) return;

    const timestamp = new Date().toISOString();
    const dataStr = data ? ` ${JSON.stringify(data)}` : '';
    const logLine = `[${timestamp}] [DEBUG] ${message}${dataStr}\n`;

    console.log(logLine.trim());

    if (!existsSync(this.logDir)) {
      mkdirSync(this.logDir, { recursive: true });
    }

    appendFileSync(join(this.logDir, 'wopal-cli.log'), logLine);
  }

  info(message: string, data?: any): void {
    const timestamp = new Date().toISOString();
    const dataStr = data ? ` ${JSON.stringify(data)}` : '';
    const logLine = `[${timestamp}] [INFO] ${message}${dataStr}\n`;

    console.log(logLine.trim());

    if (this.isDebug) {
      if (!existsSync(this.logDir)) {
        mkdirSync(this.logDir, { recursive: true });
      }
      appendFileSync(join(this.logDir, 'wopal-cli.log'), logLine);
    }
  }

  warn(message: string, data?: any): void {
    const timestamp = new Date().toISOString();
    const dataStr = data ? ` ${JSON.stringify(data)}` : '';
    const logLine = `[${timestamp}] [WARN] ${message}${dataStr}\n`;

    console.warn(logLine.trim());

    if (this.isDebug) {
      if (!existsSync(this.logDir)) {
        mkdirSync(this.logDir, { recursive: true });
      }
      appendFileSync(join(this.logDir, 'wopal-cli.log'), logLine);
    }
  }

  error(message: string, data?: any): void {
    const timestamp = new Date().toISOString();
    const dataStr = data ? ` ${JSON.stringify(data)}` : '';
    const logLine = `[${timestamp}] [ERROR] ${message}${dataStr}\n`;

    console.error(logLine.trim());

    if (this.isDebug) {
      if (!existsSync(this.logDir)) {
        mkdirSync(this.logDir, { recursive: true });
      }
      appendFileSync(join(this.logDir, 'wopal-cli.log'), logLine);
    }
  }
}
