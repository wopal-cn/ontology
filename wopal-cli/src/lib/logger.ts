import { appendFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

function getLocalTimestamp(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  const offset = -now.getTimezoneOffset();
  const offsetHours = String(Math.floor(Math.abs(offset) / 60)).padStart(
    2,
    "0",
  );
  const offsetMinutes = String(Math.abs(offset) % 60).padStart(2, "0");
  const offsetSign = offset >= 0 ? "+" : "-";
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${offsetSign}${offsetHours}:${offsetMinutes}`;
}

export class Logger {
  private isDebug: boolean;
  private logDir: string;

  constructor(debug: boolean = false) {
    this.isDebug = debug;
    this.logDir = join(process.cwd(), "logs");
  }

  log(message: string): void {
    if (!this.isDebug) return;
    const timestamp = getLocalTimestamp();
    const logLine = `[${timestamp}] [DEBUG] ${message}\n`;

    if (!existsSync(this.logDir)) {
      mkdirSync(this.logDir, { recursive: true });
    }

    appendFileSync(join(this.logDir, "wopal-cli.log"), logLine);
  }

  debug(message: string, data?: any): void {
    if (!this.isDebug) return;

    const timestamp = getLocalTimestamp();
    const dataStr = data ? ` ${JSON.stringify(data)}` : "";
    const logLine = `[${timestamp}] [DEBUG] ${message}${dataStr}\n`;

    console.log(logLine.trim());

    if (!existsSync(this.logDir)) {
      mkdirSync(this.logDir, { recursive: true });
    }

    appendFileSync(join(this.logDir, "wopal-cli.log"), logLine);
  }

  info(message: string, data?: any): void {
    const timestamp = getLocalTimestamp();
    const dataStr = data ? ` ${JSON.stringify(data)}` : "";
    const logLine = `[${timestamp}] [INFO] ${message}${dataStr}\n`;

    if (this.isDebug) {
      console.log(logLine.trim());
    }

    if (!existsSync(this.logDir)) {
      mkdirSync(this.logDir, { recursive: true });
    }
    appendFileSync(join(this.logDir, "wopal-cli.log"), logLine);
  }

  warn(message: string, data?: any): void {
    const timestamp = getLocalTimestamp();
    const dataStr = data ? ` ${JSON.stringify(data)}` : "";
    const logLine = `[${timestamp}] [WARN] ${message}${dataStr}\n`;

    console.warn(logLine.trim());

    if (this.isDebug) {
      if (!existsSync(this.logDir)) {
        mkdirSync(this.logDir, { recursive: true });
      }
      appendFileSync(join(this.logDir, "wopal-cli.log"), logLine);
    }
  }

  error(message: string, data?: any): void {
    const timestamp = getLocalTimestamp();
    const dataStr = data ? ` ${JSON.stringify(data)}` : "";
    const logLine = `[${timestamp}] [ERROR] ${message}${dataStr}\n`;

    console.error(logLine.trim());

    if (this.isDebug) {
      if (!existsSync(this.logDir)) {
        mkdirSync(this.logDir, { recursive: true });
      }
      appendFileSync(join(this.logDir, "wopal-cli.log"), logLine);
    }
  }
}
