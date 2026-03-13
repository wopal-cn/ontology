import type { Command } from "commander";
import { spawnSync } from "child_process";
import type {
  CommandEntry,
  ModuleEntry,
  ExternalPassthroughEntry,
  ExternalIntegratedEntry,
  ProgramContext,
  RouteSpec,
  CommandGroupDefinition,
  SubCommandDefinition,
} from "./types.js";
import { buildHelpText } from "../lib/help-texts.js";

export class CommandRegistry {
  private entries: CommandEntry[] = [];

  register(entry: CommandEntry): void {
    const existing = this.entries.find((e) => e.id === entry.id);
    if (existing) {
      this.entries = this.entries.filter((e) => e.id !== entry.id);
    }
    this.entries.push(entry);
  }

  registerAll(entries: CommandEntry[]): void {
    for (const entry of entries) {
      this.register(entry);
    }
  }

  getEntries(): CommandEntry[] {
    return [...this.entries];
  }

  findRoute(path: string[], argv: string[]): RouteSpec | null {
    for (const entry of this.entries) {
      if (entry.type === "module" && entry.routes) {
        for (const route of entry.routes) {
          if (route.match(path, argv)) {
            return route;
          }
        }
      }
      if (entry.type === "external-integrated" && entry.routes) {
        for (const route of entry.routes) {
          if (route.match(path, argv)) {
            return route;
          }
        }
      }
    }
    return null;
  }

  async registerAllToCommander(
    program: Command,
    context: ProgramContext,
  ): Promise<void> {
    for (const entry of this.entries) {
      await this.registerEntry(program, entry, context);
    }
  }

  private async registerEntry(
    program: Command,
    entry: CommandEntry,
    context: ProgramContext,
  ): Promise<void> {
    switch (entry.type) {
      case "module":
        await this.registerModule(program, entry, context);
        break;
      case "external-passthrough":
        this.registerExternalPassthrough(program, entry);
        break;
      case "external-integrated":
        await this.registerExternalIntegrated(program, entry, context);
        break;
    }
  }

  private async registerModule(
    program: Command,
    entry: ModuleEntry,
    context: ProgramContext,
  ): Promise<void> {
    await entry.register({ program, context });
  }

  private registerExternalPassthrough(
    program: Command,
    entry: ExternalPassthroughEntry,
  ): void {
    const command = program
      .command(`${entry.id} [args...]`)
      .description(entry.description)
      .allowUnknownOption(true)
      .allowExcessArguments(true)
      .action((args: string[]) => {
        const result = spawnSync(entry.binary, args || [], {
          stdio: "inherit",
          shell: process.platform === "win32",
        });
        if (result.status !== 0) {
          process.exit(result.status || 1);
        }
      });

    command.addHelpText(
      "after",
      `\nExternal command: ${entry.binary}\nRun '${entry.binary} ${entry.helpCommand || "--help"}' for details.\n`,
    );
  }

  private async registerExternalIntegrated(
    program: Command,
    entry: ExternalIntegratedEntry,
    context: ProgramContext,
  ): Promise<void> {
    try {
      const mod = await import(entry.modulePath);
      const registerFn = mod[entry.exportName];
      if (typeof registerFn !== "function") {
        throw new Error(
          `Export "${entry.exportName}" is not a function in ${entry.modulePath}`,
        );
      }
      await registerFn({ program, context });
    } catch (error) {
      console.error(`Failed to load external command "${entry.id}": ${error}`);
      program
        .command(`${entry.id}`)
        .description(`${entry.description} (unavailable)`)
        .action(() => {
          console.error(
            `Command "${entry.id}" is not available. Check installation.`,
          );
          process.exit(1);
        });
    }
  }
}

let globalRegistry: CommandRegistry | null = null;

export function getCommandRegistry(): CommandRegistry {
  if (!globalRegistry) {
    globalRegistry = new CommandRegistry();
  }
  return globalRegistry;
}

export function resetCommandRegistry(): void {
  globalRegistry = null;
}

export function registerCommandGroup(
  program: Command,
  definition: CommandGroupDefinition,
  context: ProgramContext,
): void {
  const group = program
    .command(definition.name)
    .description(definition.description)
    .addHelpCommand(false);

  for (const sub of definition.subcommands) {
    registerSubCommand(group, sub, context);
  }

  if (definition.helpText) {
    group.addHelpText("after", buildHelpText(definition.helpText));
  }
}

export function registerSubCommand(
  parent: Command,
  definition: SubCommandDefinition,
  context: ProgramContext,
): void {
  let cmd: Command;

  if (definition.arguments) {
    cmd = parent
      .command(`${definition.name} ${definition.arguments}`)
      .description(definition.description);
  } else {
    cmd = parent.command(definition.name).description(definition.description);
  }

  for (const opt of definition.options || []) {
    if (opt.defaultValue !== undefined) {
      const defaultValue = opt.defaultValue;
      if (typeof defaultValue === "number") {
        cmd.option(opt.flags, opt.description, String(defaultValue));
      } else {
        cmd.option(opt.flags, opt.description, defaultValue);
      }
    } else {
      cmd.option(opt.flags, opt.description);
    }
  }

  cmd.action(async (...args) => {
    const cmdObj = args.pop() as Command;
    const options = cmdObj.opts() as Record<string, unknown>;
    const positionalArgs = args.reduce(
      (acc, val, idx) => {
        acc[`arg${idx}`] = val;
        return acc;
      },
      {} as Record<string, unknown>,
    );

    await definition.action(positionalArgs, options, context);
  });

  if (definition.helpText) {
    cmd.addHelpText("after", buildHelpText(definition.helpText));
  }
}

export type {
  RouteSpec,
  CommandEntry,
  ModuleEntry,
  ExternalPassthroughEntry,
  ExternalIntegratedEntry,
  CommandGroupDefinition,
  SubCommandDefinition,
} from "./types.js";
