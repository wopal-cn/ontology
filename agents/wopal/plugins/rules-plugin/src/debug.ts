import { appendFileSync, existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { tmpdir } from "os";

export type DebugLog = (message: string) => void;

function getLogFile(): string {
  const logPath = process.env.OPENCODE_RULES_LOG_FILE;
  if (logPath) {
    return logPath;
  }

  // Default log path in temp directory
  return join(tmpdir(), "opencode-rules-debug.log");
}

function ensureLogFile(logFile: string): boolean {
  const dir = dirname(logFile);
  if (!existsSync(dir)) {
    try {
      mkdirSync(dir, { recursive: true });
    } catch {
      return false;
    }
  }
  return true;
}

export function createDebugLog(prefix = "[opencode-rules]"): DebugLog {
  const logFile = getLogFile();

  return (message: string): void => {
    if (!process.env.OPENCODE_RULES_DEBUG) {
      return;
    }

    if (!ensureLogFile(logFile)) {
      return;
    }

    const timestamp = new Date().toISOString();
    const logMessage = `${timestamp} ${prefix} ${message}\n`;

    try {
      appendFileSync(logFile, logMessage, "utf-8");
    } catch {
      // Silently ignore write errors
    }
  };
}
