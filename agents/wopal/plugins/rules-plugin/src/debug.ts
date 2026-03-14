import { appendFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";

export type DebugLog = (message: string) => void;

function getLogFile(): string | null {
  const logPath = process.env.OPENCODE_RULES_LOG_FILE;
  if (!logPath) {
    return null;
  }

  // 确保日志目录存在
  const dir = dirname(logPath);
  if (!existsSync(dir)) {
    try {
      mkdirSync(dir, { recursive: true });
    } catch (error) {
      console.warn(`[opencode-rules] Failed to create log directory: ${error}`);
      return null;
    }
  }

  return logPath;
}

export function createDebugLog(prefix = "[opencode-rules]"): DebugLog {
  const logFile = getLogFile();

  return (message: string): void => {
    if (process.env.OPENCODE_RULES_DEBUG) {
      const timestamp = new Date().toISOString();
      const logMessage = `${timestamp} ${prefix} ${message}\n`;

      // 如果指定了日志文件，写入文件
      if (logFile) {
        try {
          appendFileSync(logFile, logMessage, "utf-8");
        } catch (error) {
          console.warn(
            `[opencode-rules] Failed to write to log file: ${error}`,
          );
        }
      } else {
        // 否则输出到控制台
        console.debug(`${prefix} ${message}`);
      }
    }
  };
}
