import { existsSync } from "fs";
import { CommandError } from "./error-utils.js";
import { getConfig } from "./config.js";

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

  // 2. Check IOC database exists
  const iocdbDir = config.getSkillIocdbDir();

  if (!existsSync(iocdbDir)) {
    throw new CommandError({
      code: "IOC_DATABASE_NOT_FOUND",
      message: `IOC database not found: ${iocdbDir}`,
      suggestion:
        "Initialize IOC database with: git submodule update --init\n" +
        "Or configure a different path with WOPAL_SKILLS_IOCDB_DIR environment variable",
    });
  }
}
