/**
 * System Transform Hook - Memory injection + snapshot/dump
 *
 * Coordinates memory-injector module.
 */

import type { SessionStore } from "../session-store.js";
import type { MemoryInjector } from "../memory/index.js";
import type { DebugLog } from "../debug.js";
import type { SystemPromptMetadata } from "../types.js";
import type { MessageWithInfo } from "./message-context.js";
import type { Model } from "@opencode-ai/sdk";
import { writeContextDump } from "../tools/dump-formatter.js";
import {
  injectMemoriesIntoSystem,
  isChildSession,
  type MemoryInjectorContext,
  type SystemTransformOutput,
} from "./memory-injector.js";

interface SystemTransformInput {
  sessionID?: string;
  model: Model;
  systemMetadata?: SystemPromptMetadata;
}

export interface SystemTransformHookContext {
  client: unknown;
  directory: string;
  projectDirectory: string;
  sessionStore: SessionStore;
  memoryDebugLog: DebugLog;
  contextDebugLog: DebugLog;
  now: () => number;
  memoryInjector: MemoryInjector | undefined;
  childSessionCache: Map<string, boolean>;
  taskManager: { findBySession: (sessionID: string) => unknown } | undefined;
  systemSnapshots?: Map<string, string[]>;
  systemMetadataMap?: Map<string, SystemPromptMetadata>;
  systemInjectionsMap?: Map<string, string[]>;
  transformedMessagesMap?: Map<string, MessageWithInfo[]>;
  memoryInjectionEnabled: boolean;   // Passed from HookContext
}

export function createSystemTransformHooks(ctx: SystemTransformHookContext) {
  const memoryInjectorCtx: MemoryInjectorContext = {
    client: ctx.client,
    sessionStore: ctx.sessionStore,
    memoryDebugLog: ctx.memoryDebugLog,
    memoryInjector: ctx.memoryInjector,
    childSessionCache: ctx.childSessionCache,
    taskManager: ctx.taskManager,
  };

  async function onSystemTransform(
    hookInput: SystemTransformInput,
    output: SystemTransformOutput | null,
  ): Promise<SystemTransformOutput> {
    const sessionID = hookInput?.sessionID;

    if (sessionID) {
      const skip = ctx.sessionStore.shouldSkipInjection(sessionID);
      if (skip) {
        ctx.contextDebugLog(
          `Session ${sessionID} is compacting - skipping memory injection`,
        );
        return output ?? { system: [] };
      }
    }

    if (!output) {
      output = { system: [] };
    }
    if (!output.system) {
      output.system = [];
    }

    // Record initial length before plugin injections
    const initialSystemLength = output.system.length;

    // Memory injection (after rules, into same system array)
    if (ctx.memoryInjectionEnabled && ctx.memoryInjector && sessionID) {
      await injectMemoriesIntoSystem(memoryInjectorCtx, sessionID, output);
    }

    // Snapshot system prompt for context dump
    if (sessionID && ctx.systemSnapshots) {
      ctx.systemSnapshots.set(sessionID, [...output.system]);
    }

    // Store structured metadata if available
    if (sessionID && hookInput.systemMetadata && ctx.systemMetadataMap) {
      ctx.systemMetadataMap.set(sessionID, hookInput.systemMetadata);
      ctx.contextDebugLog(`Stored systemMetadata for session ${sessionID}: ${hookInput.systemMetadata.sections.length} sections`);
    } else if (sessionID && ctx.systemMetadataMap) {
      ctx.contextDebugLog(`No systemMetadata in hook input for session ${sessionID} (keys in map: ${ctx.systemMetadataMap.size})`);
    }

    // Store plugin injections (content appended after OpenCode's original system blocks)
    if (sessionID && ctx.systemInjectionsMap && output.system.length > initialSystemLength) {
      ctx.systemInjectionsMap.set(sessionID, output.system.slice(initialSystemLength));
    }

    // Auto-dump: requires explicit "context" module (not triggered by "all" wildcard)
    const debug = process.env.WOPAL_PLUGIN_DEBUG;
    const explicitContext = debug && debug.toLowerCase().split(",").map(m => m.trim()).includes("context");
    if (sessionID && explicitContext) {
      ctx.contextDebugLog(`[auto-dump] triggered for session ${sessionID}`);
      void writeContextDump({
        sessionID,
        baseDir: ctx.directory,
        filenamePrefix: "AUTO-CTXDUMP",
        systemSnapshots: ctx.systemSnapshots ?? new Map(),
        systemMetadataMap: ctx.systemMetadataMap ?? new Map(),
        systemInjectionsMap: ctx.systemInjectionsMap ?? new Map(),
        transformedMessagesMap: ctx.transformedMessagesMap ?? new Map(),
        client: ctx.client,
        detail: false,
      }).catch(err => ctx.contextDebugLog(`[auto-dump] error: ${err}`));
    }

    return output;
  }

  return {
    "experimental.chat.system.transform": onSystemTransform,
    _isChildSession: (sessionID: string) =>
      isChildSession(memoryInjectorCtx, sessionID),
    _onSystemTransform: onSystemTransform,
  };
}