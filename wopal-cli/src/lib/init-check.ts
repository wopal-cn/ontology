import { CommandError } from "./error-utils.js";
import { getConfig } from "./config.js";

export function checkInitialization(): void {
  const config = getConfig();
  const activeSpace = config.getActiveSpace();

  if (!activeSpace) {
    throw new CommandError({
      code: "NOT_INITIALIZED",
      message: "No active workspace found",
      suggestion: "Run 'wopal init' to initialize a workspace",
    });
  }
}
