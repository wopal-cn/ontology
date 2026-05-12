import { createDebugLog, type DebugLog } from "../debug.js";
import type { SessionStore } from "../session-store.js";
import type { SimpleTaskManager } from "../tasks/simple-task-manager.js";
import type { MemoryInjector } from "../memory/index.js";
import type { DiscoveredRule } from "../rules/index.js";
import type { SystemPromptMetadata } from "../types.js";
import { createCommandHooks } from "./command-hooks.js";
import { createMessageHooks } from "./message-hooks.js";
import { createSystemTransformHooks } from "./system-transform.js";
import { createEventRouter } from "./event-router.js";
import { createCompactionHooks } from "./compaction.js";

export interface HookContextOptions {
  client: unknown;
  directory: string;
  projectDirectory: string;
  ruleFiles: DiscoveredRule[];
  sessionStore: SessionStore;
  debugLog?: DebugLog;
  now?: () => number;
  taskManager?: SimpleTaskManager;
  memoryInjector?: MemoryInjector | undefined;
  systemSnapshots?: Map<string, string[]>;
  systemMetadataMap?: Map<string, SystemPromptMetadata>;
  systemInjectionsMap?: Map<string, string[]>;
}

export interface HookContext {
  client: unknown;
  directory: string;
  projectDirectory: string;
  ruleFiles: DiscoveredRule[];
  sessionStore: SessionStore;
  debugLog: DebugLog;
  taskDebugLog: DebugLog;
  injectDebugLog: DebugLog;
  now: () => number;
  taskManager: SimpleTaskManager | undefined;
  memoryInjector: MemoryInjector | undefined;
  childSessionCache: Map<string, boolean>;
  systemSnapshots: Map<string, string[]>;
  systemMetadataMap: Map<string, SystemPromptMetadata>;
  systemInjectionsMap: Map<string, string[]>;
}

export function createHookContext(opts: HookContextOptions): HookContext {
  return {
    client: opts.client,
    directory: opts.directory,
    projectDirectory: opts.projectDirectory,
    ruleFiles: opts.ruleFiles,
    sessionStore: opts.sessionStore,
    debugLog: opts.debugLog ?? createDebugLog(),
    taskDebugLog: createDebugLog("[wopal-task]", "task"),
    injectDebugLog: createDebugLog("[wopal-memory]", "memory"),
    now: opts.now ?? (() => Date.now()),
    taskManager: opts.taskManager ?? undefined,
    memoryInjector: opts.memoryInjector,
    childSessionCache: new Map<string, boolean>(),
    systemSnapshots: opts.systemSnapshots ?? new Map(),
    systemMetadataMap: opts.systemMetadataMap ?? new Map(),
    systemInjectionsMap: opts.systemInjectionsMap ?? new Map(),
  };
}

export function createAllHooks(ctx: HookContext): Record<string, unknown> {
  const commandHooks = createCommandHooks({
    sessionStore: ctx.sessionStore,
    debugLog: ctx.debugLog,
    projectDirectory: ctx.projectDirectory,
  });

  const messageHooks = createMessageHooks({
    sessionStore: ctx.sessionStore,
    debugLog: ctx.debugLog,
    projectDirectory: ctx.projectDirectory,
  });

  const systemTransformHooks = createSystemTransformHooks({
    client: ctx.client,
    directory: ctx.directory,
    projectDirectory: ctx.projectDirectory,
    ruleFiles: ctx.ruleFiles,
    sessionStore: ctx.sessionStore,
    debugLog: ctx.debugLog,
    injectDebugLog: ctx.injectDebugLog,
    now: ctx.now,
    memoryInjector: ctx.memoryInjector,
    childSessionCache: ctx.childSessionCache,
    taskManager: ctx.taskManager,
    systemSnapshots: ctx.systemSnapshots,
    systemMetadataMap: ctx.systemMetadataMap,
    systemInjectionsMap: ctx.systemInjectionsMap,
  });

  const eventRouter = createEventRouter({
    client: ctx.client,
    sessionStore: ctx.sessionStore,
    debugLog: ctx.debugLog,
    taskDebugLog: ctx.taskDebugLog,
    taskManager: ctx.taskManager,
  });

  const compactionHooks = createCompactionHooks({
    sessionStore: ctx.sessionStore,
    debugLog: ctx.debugLog,
    now: ctx.now,
  });

  return {
    ...commandHooks,
    ...messageHooks,
    ...systemTransformHooks,
    ...eventRouter,
    ...compactionHooks,
  };
}

// Re-export for backward compatibility with tests that import OpenCodeRulesRuntime
// This class wraps the new functional hooks API
export { createSystemTransformHooks } from "./system-transform.js";
export { createEventRouter } from "./event-router.js";
