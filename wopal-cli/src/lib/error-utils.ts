export interface CommandErrorOptions {
  code: string;
  message: string;
  suggestion?: string;
}

export class CommandError extends Error {
  public readonly code: string;
  public readonly suggestion?: string;

  constructor(options: CommandErrorOptions) {
    super(options.message);
    this.name = "CommandError";
    this.code = options.code;
    this.suggestion = options.suggestion;
  }

  toUserMessage(): string {
    let output = `Error: ${this.message}`;
    if (this.suggestion) {
      output += `\n\n${this.suggestion}`;
    }
    return output;
  }
}

export function handleCommandError(error: unknown): never {
  if (error instanceof CommandError) {
    console.error(error.toUserMessage());
    process.exit(1);
  }

  if (error instanceof Error) {
    console.error(`\nError: ${error.message}`);
    process.exit(1);
  }

  console.error(`\nError: ${String(error)}`);
  process.exit(1);
}

export function createMissingArgumentError(
  argName: string,
  command: string,
): CommandError {
  return new CommandError({
    code: "MISSING_ARGUMENT",
    message: `Missing required argument: ${argName}`,
    suggestion: `Use 'wopal ${command} --help' for usage information`,
  });
}

export function createSkillNotFoundError(skillName: string): CommandError {
  return new CommandError({
    code: "SKILL_NOT_FOUND",
    message: `Skill '${skillName}' not found`,
    suggestion: "Use 'wopal list' to see installed skills",
  });
}

export function createSkillNotInInboxError(skillName: string): CommandError {
  return new CommandError({
    code: "SKILL_NOT_IN_INBOX",
    message: `Skill '${skillName}' not found in INBOX`,
    suggestion: "Use 'wopal inbox list' to see downloaded skills",
  });
}

export function createSkillAlreadyExistsError(skillName: string): CommandError {
  return new CommandError({
    code: "SKILL_ALREADY_EXISTS",
    message: `Skill '${skillName}' is already installed`,
    suggestion: "Use --force to overwrite",
  });
}

export function createInvalidSourceError(source: string): CommandError {
  return new CommandError({
    code: "INVALID_SOURCE",
    message: `Invalid source format: ${source}`,
    suggestion: "Use format: owner/repo@skill-name",
  });
}
