import { spawnSync } from "child_process";
import { Command } from "commander";
import { Logger } from "../../lib/logger.js";
import { buildHelpText } from "../../lib/help-texts.js";

let logger: Logger;

export function setLogger(l: Logger): void {
  logger = l;
}

export function registerPassthroughCommand(program: Command): void {
  const command = program
    .command("find <query>")
    .description("Search for skills (via Skills CLI)")
    .action(async (query: string) => {
      await passthroughFind(query);
    });

  command.addHelpText(
    "after",
    buildHelpText({
      examples: [
        "# Search for skills\nwopal skills find <query>",
        '# Example search\nwopal skills find "web scraping"',
      ],
      options: [
        "<query>      Search query string",
        "--help       Show this help message",
      ],
      notes: [
        "This command passes through to Skills CLI (npx skills find)",
        "Requires network connection to search remote skill registry",
      ],
    }),
  );
}

async function passthroughFind(query: string): Promise<void> {
  logger?.log(`Passthrough find: ${query}`);

  const args = ["-y", "skills", "find", query];

  const result = spawnSync("npx", args, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.error) {
    console.error("Error: Skills CLI execution failed");
    logger?.error(`Skills CLI error: ${result.error}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error("Error: Skills CLI command failed");
    process.exit(result.status || 1);
  }
}
