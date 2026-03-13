import type {
  SubCommandDefinition,
  ProgramContext,
} from "../../program/types.js";
import {
  ensureOpenclawRepo,
  getOpenclawDir,
  validateOpenclawRepo,
} from "../../scanner/openclaw-updater.js";
import { handleCommandError } from "../../lib/error-utils.js";

export interface UpdateScannerOptions {
  json?: boolean;
  force?: boolean;
}

async function updateScannerCommand(
  options: UpdateScannerOptions,
  context: ProgramContext,
): Promise<number> {
  const { output } = context;
  try {
    const result = await ensureOpenclawRepo(options.force || false);

    const validation = validateOpenclawRepo();

    const outputData = {
      success: validation.valid,
      updated: result.updated,
      version: result.version,
      message: validation.valid ? result.message : validation.error,
      path: getOpenclawDir(),
    };

    if (options.json) {
      output.json(outputData);
    } else {
      if (validation.valid) {
        output.print(`Scanner ${result.message}`);
        output.print(`  Version: ${result.version}`);
        output.print(`  Path: ${outputData.path}`);
      } else {
        output.error(`Scanner validation failed: ${validation.error}`);
      }
    }

    return validation.valid ? 0 : 2;
  } catch (error) {
    const message = (error as Error).message;

    if (options.json) {
      output.json({
        success: false,
        updated: false,
        version: "unknown",
        message,
        path: getOpenclawDir(),
      });
    } else {
      output.error("Failed to update scanner", message);
    }

    return 2;
  }
}

export const updateScannerSubcommand: SubCommandDefinition = {
  name: "update-scanner",
  description: "Update the OpenClaw security scanner database",
  options: [
    { flags: "--json", description: "Output JSON format" },
    { flags: "--force", description: "Force update even if recently updated" },
  ],
  action: async (_args, options, context) => {
    try {
      const updateOptions: UpdateScannerOptions = {
        json: options.json as boolean | undefined,
        force: options.force as boolean | undefined,
      };
      const exitCode = await updateScannerCommand(updateOptions, context);
      process.exit(exitCode);
    } catch (error) {
      handleCommandError(error);
    }
  },
  helpText: {
    examples: [
      "wopal skills update-scanner         # Update scanner",
      "wopal skills update-scanner --force # Force update",
      "wopal skills update-scanner --json  # JSON output",
    ],
    notes: [
      "Updates OpenClaw security scanner repository",
      "Auto-updates every 24 hours during normal scans",
      "Location: ~/.wopal/storage/openclaw-security-monitor/",
    ],
  },
};
