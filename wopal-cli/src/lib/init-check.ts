import { existsSync } from "fs";
import { CommandError } from "./error-utils.js";
import { getConfig } from "./config.js";
import { getOpenclawDir } from "../scanner/openclaw-updater.js";

export function checkInitialization(): void {
  const config = getConfig();
  const activeSpace = config.getActiveSpace();

  // 1. Check active space
  if (!activeSpace) {
    throw new CommandError({
      code: "NOT_INITIALIZED",
      message: "No active workspace found",
      suggestion: "Run 'wopal init' to initialize a workspace",
    });
  }

  // 2. Check OpenClaw scanner directory exists
  const openclawDir = getOpenclawDir();

  if (!existsSync(openclawDir)) {
    throw new CommandError({
      code: "OPENCLAW_NOT_FOUND",
      message: `OpenClaw scanner not found: ${openclawDir}`,
      suggestion:
        "Initialize OpenClaw scanner with: wopal skills update-scanner\n" +
        "Or configure a different path with WOPAL_OPENCLAW_DIR environment variable",
    });
  }
}
