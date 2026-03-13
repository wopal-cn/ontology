import type { Command } from "commander";
import type { ConfigService } from "../lib/config.js";
import type { OutputService } from "../lib/output-service.js";

export interface ProgramContext {
  version: string;
  debug: boolean;
  config: ConfigService;
  output: OutputService;
}

export interface ProgramContextParams {
  version: string;
  debug: boolean;
  config: ConfigService;
  output: OutputService;
}

export interface RouteSpec {
  match: (path: string[], argv: string[]) => boolean;
  run: (argv: string[], context: ProgramContext) => Promise<boolean>;
}

export interface RegisterParams {
  program: Command;
  context: ProgramContext;
}

export interface ModuleEntry {
  type: "module";
  id: string;
  description: string;
  register: (params: RegisterParams) => void | Promise<void>;
  routes?: RouteSpec[];
}

export interface ExternalPassthroughEntry {
  type: "external-passthrough";
  id: string;
  description: string;
  binary: string;
  helpCommand?: string;
}

export interface ExternalIntegratedEntry {
  type: "external-integrated";
  id: string;
  description: string;
  modulePath: string;
  exportName: string;
  routes?: RouteSpec[];
}

export type CommandEntry =
  | ModuleEntry
  | ExternalPassthroughEntry
  | ExternalIntegratedEntry;

export interface SubCommandDefinition {
  name: string;
  description: string;
  arguments?: string;
  options?: Array<{
    flags: string;
    description: string;
    defaultValue?: string | boolean | number;
  }>;
  action: (
    args: Record<string, unknown>,
    options: Record<string, unknown>,
    context: ProgramContext,
  ) => void | Promise<void>;
  helpText?: {
    examples?: string[];
    notes?: string[];
    workflow?: string[];
  };
}

export interface CommandGroupDefinition {
  name: string;
  description: string;
  subcommands: SubCommandDefinition[];
  helpText?: {
    examples?: string[];
    notes?: string[];
    workflow?: string[];
  };
}
