/**
 * TypeScript type definitions for @wopal/process
 */

export interface SessionOptions {
  cwd?: string;
  env?: Record<string, string>;
  name?: string;
  tags?: string[];
  pty?: boolean;
  timeout?: number;
}

export interface SessionMeta {
  id: string;
  command: string;
  cwd: string;
  env: Record<string, string>;
  name: string | null;
  tags: string[];
  startedAt: number;
  finishedAt: number | null;
  exited: boolean;
  exitCode: number | null;
  backgrounded: boolean;
  truncated: boolean;
  pty: boolean;
}

export interface PollResult {
  running: boolean;
  exitCode: number | null;
  output: string;
}

export interface LogOptions {
  limit?: number;
  offset?: number;
}

export class ProcessSession {
  constructor(id: string, command: string, options?: SessionOptions);
  id: string;
  command: string;
  cwd: string;
  env: Record<string, string>;
  name: string | null;
  tags: string[];
  startedAt: number;
  finishedAt: number | null;
  exited: boolean;
  exitCode: number | null;
  backgrounded: boolean;
  truncated: boolean;
  pty: boolean;
  logFile: string;
  metaFile: string;
  
  saveMeta(): void;
  appendOutput(chunk: string | Buffer): void;
  readOutput(options?: LogOptions): string;
  markExited(code: number): void;
  delete(): void;
}

export class ProcessRegistry {
  static listRunning(): SessionMeta[];
  static listFinished(): SessionMeta[];
  static listAll(): SessionMeta[];
  static getSession(id: string): ProcessSession | null;
  static deleteSession(id: string): boolean;
  static clearFinished(): number;
}

export class Executor {
  constructor(session: ProcessSession);
  start(): number;
  kill(signal?: string): boolean;
  getPid(): number | null;
}

export class ProcessManager {
  constructor();
  
  start(command: string, options?: SessionOptions): string;
  poll(sessionId: string): PollResult | null;
  log(sessionId: string, options?: LogOptions): string | null;
  write(sessionId: string, data: string): boolean;
  kill(sessionId: string, signal?: string): boolean;
  clear(sessionId: string): boolean;
  remove(sessionId: string): boolean;
  list(filter?: 'all' | 'running' | 'finished'): SessionMeta[];
}

export const SESSION_DIR: string;
export const LOG_DIR: string;
export const MAX_OUTPUT_SIZE: number;
