export {
  createProgramContext,
  type ProgramContext,
  type ProgramContextParams,
} from "./context.js";
export {
  getCommandRegistry,
  resetCommandRegistry,
  registerCommandGroup,
  registerSubCommand,
  CommandRegistry,
  type CommandEntry,
  type ModuleEntry,
  type ExternalPassthroughEntry,
  type ExternalIntegratedEntry,
  type RouteSpec,
  type CommandGroupDefinition,
  type SubCommandDefinition,
} from "./command-registry.js";
export type { RegisterParams } from "./types.js";
