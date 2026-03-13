import type { ProgramContext, ProgramContextParams } from "./types.js";

export function createProgramContext(
  params: ProgramContextParams,
): ProgramContext {
  return {
    version: params.version,
    debug: params.debug,
    config: params.config,
    output: params.output,
  };
}

export type { ProgramContext, ProgramContextParams } from "./types.js";
