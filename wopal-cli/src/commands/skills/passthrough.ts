import { spawnSync } from "child_process";
import type {
  SubCommandDefinition,
  ProgramContext,
} from "../../program/types.js";
import { handleCommandError } from "../../lib/error-utils.js";

async function passthroughFind(
  query: string,
  context: ProgramContext,
): Promise<void> {
  const { output, debug } = context;

  if (debug) {
    output.print(`Passthrough find: ${query}`);
  }

  const args = ["-y", "skills", "find", query];

  const result = spawnSync("npx", args, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.error) {
    output.error("Skills CLI execution failed");
    if (debug) {
      output.error(`Skills CLI error: ${result.error}`);
    }
    process.exit(1);
  }

  if (result.status !== 0) {
    output.error("Skills CLI command failed");
    process.exit(result.status || 1);
  }
}

export const passthroughSubcommand: SubCommandDefinition = {
  name: "find <query>",
  description: "Search for skills (via Skills CLI)",
  action: async (args, _options, context) => {
    try {
      const query = args.arg0 as string;
      await passthroughFind(query, context);
    } catch (error) {
      handleCommandError(error);
    }
  },
  helpText: {
    examples: [
      'wopal skills find "web scraping"   # Search for skills',
      "wopal skills find openspec         # Search by keyword",
    ],
    notes: [
      "Passes through to Skills CLI (npx skills find)",
      "Requires network connection",
    ],
  },
};
