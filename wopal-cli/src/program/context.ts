export type ProgramContext = {
  programVersion: string;
};

export function createProgramContext(version: string): ProgramContext {
  return {
    programVersion: version,
  };
}
