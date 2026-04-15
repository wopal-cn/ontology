/**
 * System Transform Hook - Facade for rule + memory injection
 *
 * Coordinates rule-injector and memory-injector modules.
 */

import type { DiscoveredRule } from "../rules/index.js";
import type { SessionStore } from "../session-store.js";
import type { MemoryInjector } from "../memory/index.js";
import type { DebugLog } from "../debug.js";
import type { Model } from "@opencode-ai/sdk";
import {
  injectRules,
  queryAvailableToolIDs,
  type RuleInjectorContext,
} from "./rule-injector.js";
import {
  injectMemoriesIntoSystem,
  isChildSession,
  type MemoryInjectorContext,
  type SystemTransformOutput,
} from "./memory-injector.js";

interface SystemTransformInput {
  sessionID?: string;
  model: Model;
}

export interface SystemTransformHookContext {
  client: unknown;
  directory: string;
  projectDirectory: string;
  ruleFiles: DiscoveredRule[];
  sessionStore: SessionStore;
  debugLog: DebugLog;
  injectDebugLog: DebugLog;
  now: () => number;
  memoryInjector: MemoryInjector | undefined;
  childSessionCache: Map<string, boolean>;
  taskManager: { findBySession: (sessionID: string) => unknown } | undefined;
}

export function createSystemTransformHooks(ctx: SystemTransformHookContext) {
  // Build sub-module contexts
  const ruleInjectorCtx: RuleInjectorContext = {
    client: ctx.client,
    directory: ctx.directory,
    ruleFiles: ctx.ruleFiles,
    debugLog: ctx.debugLog,
  };

  const memoryInjectorCtx: MemoryInjectorContext = {
    client: ctx.client,
    sessionStore: ctx.sessionStore,
    debugLog: ctx.debugLog,
    injectDebugLog: ctx.injectDebugLog,
    memoryInjector: ctx.memoryInjector,
    childSessionCache: ctx.childSessionCache,
    taskManager: ctx.taskManager,
  };

  async function onSystemTransform(
    hookInput: SystemTransformInput,
    output: SystemTransformOutput | null,
  ): Promise<SystemTransformOutput> {
    const sessionID = hookInput?.sessionID;
    const sessionState = sessionID
      ? ctx.sessionStore.get(sessionID)
      : undefined;

    if (sessionID) {
      const skip = ctx.sessionStore.shouldSkipInjection(sessionID);
      if (skip) {
        ctx.debugLog(
          `Session ${sessionID} is compacting - skipping rule injection`,
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

    const skillsToReload = sessionID
      ? ctx.sessionStore.consumeSkillReload(sessionID)
      : null;
    if (skillsToReload) {
      output.system.push(
        `[系统提醒] 上下文已被压缩，之前加载的技能 [${skillsToReload.join(", ")}] 内容已丢失。` +
          `请重新加载这些技能以恢复完整的指令和工具链。`,
      );
    }

    // Rule injection
    const contextPaths = sessionState
      ? Array.from(sessionState.contextPaths).sort()
      : [];
    const userPrompt = sessionState?.lastUserPrompt;

    const formattedRules = await injectRules(
      ruleInjectorCtx,
      contextPaths,
      userPrompt,
    );

    if (formattedRules) {
      output.system.push(formattedRules);
    }

    // Memory injection (after rules, into same system array)
    if (sessionID) {
      await injectMemoriesIntoSystem(memoryInjectorCtx, sessionID, output);
    }

    return output;
  }

  return {
    "experimental.chat.system.transform": onSystemTransform,
    // Expose internal methods for testing
    _queryAvailableToolIDs: () => queryAvailableToolIDs(ruleInjectorCtx),
    _isChildSession: (sessionID: string) =>
      isChildSession(memoryInjectorCtx, sessionID),
    _onSystemTransform: onSystemTransform,
  };
}