import { Command } from "commander";
import { Logger } from "../../lib/logger.js";
import {
  ensureOpenclawRepo,
  getOpenclawDir,
  validateOpenclawRepo,
} from "../../scanner/openclaw-updater.js";
import { buildHelpText } from "../../lib/help-texts.js";

let logger: Logger;

export function setLogger(l: Logger): void {
  logger = l;
}

export interface UpdateScannerOptions {
  json?: boolean;
  force?: boolean;
}

export function registerUpdateScannerCommand(program: Command): void {
  const command = program
    .command("update-scanner")
    .description("Update the OpenClaw security scanner database")
    .option("--json", "Output JSON format")
    .option("--force", "Force update even if recently updated")
    .action(async (options: UpdateScannerOptions) => {
      const exitCode = await updateScannerCommand(options);
      process.exit(exitCode);
    });

  command.addHelpText(
    "after",
    buildHelpText({
      examples: [
        "# Update scanner\nwopal skills update-scanner",
        "# Force update\nwopal skills update-scanner --force",
        "# JSON output\nwopal skills update-scanner --json",
      ],
      options: [
        "--json     Output in JSON format",
        "--force    Force update even if recently updated",
        "--help     Show this help message",
      ],
      notes: [
        "Updates the OpenClaw security scanner repository",
        "Auto-updates every 24 hours during normal scans",
        "Use --force to update immediately",
        "Scanner location: ~/.wopal/storage/openclaw-security-monitor/",
      ],
    }),
  );
}

export async function updateScannerCommand(
  options: UpdateScannerOptions,
): Promise<number> {
  try {
    const result = await ensureOpenclawRepo(options.force || false);

    const validation = validateOpenclawRepo();

    const output = {
      success: validation.valid,
      updated: result.updated,
      version: result.version,
      message: validation.valid ? result.message : validation.error,
      path: getOpenclawDir(),
    };

    if (options.json) {
      console.log(JSON.stringify(output, null, 2));
    } else {
      if (validation.valid) {
        console.log(`✓ Scanner ${result.message}`);
        console.log(`  Version: ${result.version}`);
        console.log(`  Path: ${output.path}`);
      } else {
        console.error(`✗ Scanner validation failed: ${validation.error}`);
      }
    }

    return validation.valid ? 0 : 2;
  } catch (error) {
    const message = (error as Error).message;

    if (options.json) {
      console.log(
        JSON.stringify(
          {
            success: false,
            updated: false,
            version: "unknown",
            message,
            path: getOpenclawDir(),
          },
          null,
          2,
        ),
      );
    } else {
      logger.error("Failed to update scanner", { error: message });
    }

    return 2;
  }
}
