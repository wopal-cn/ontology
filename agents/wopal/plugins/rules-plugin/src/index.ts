/**
 * OpenCode Rules Plugin
 *
 * Discovers markdown rule files and injects them into the system prompt.
 * Also provides non-blocking task delegation tools (wopal_task, wopal_output, wopal_cancel).
 */

import type { PluginInput } from "@opencode-ai/plugin";
import { discoverRuleFiles } from "./utils.js";
import { OpenCodeRulesRuntime } from "./runtime.js";
import { createSessionStore, type SessionState } from "./session-store.js";
import { createDebugLog, createWarnLog } from "./debug.js";
import { SimpleTaskManager } from "./simple-task-manager.js";
import { createWopalTools } from "./tools/index.js";

const sessionStore = createSessionStore();

const debugLog = createDebugLog();
const warnLog = createWarnLog("[wopal-plugin]");

const openCodeRulesPlugin = async (pluginInput: PluginInput) => {
  warnLog(`Plugin loaded! directory: ${pluginInput.directory}`);
  const ruleFiles = await discoverRuleFiles(pluginInput.directory);
  debugLog(`Discovered ${ruleFiles.length} rule file(s)`);
  warnLog(`Tools registered: wopal_task, wopal_output, wopal_cancel`);

  const taskManager = new SimpleTaskManager(
    pluginInput.client,
    pluginInput.directory,
  );

  const runtime = new OpenCodeRulesRuntime({
    client: pluginInput.client,
    directory: pluginInput.directory,
    projectDirectory: pluginInput.directory,
    ruleFiles,
    sessionStore,
    debugLog,
    taskManager,
  });

  const hooks = runtime.createHooks();

  return {
    ...hooks,
    tool: createWopalTools(taskManager),
  };
};

/**
 * Test-only exports for accessing internal state and functions.
 * @internal - Test utilities only. Not part of public API.
 */
// NOTE: OpenCode's plugin loader calls every named export as a plugin initializer.
// To avoid runtime crashes, __testOnly must be callable.
const __testOnly = Object.freeze(
  Object.assign(async () => ({}), {
    setSessionStateLimit: (limit: number): void => {
      sessionStore.setMax(limit);
    },
    getSessionStateIDs: (): string[] => {
      return sessionStore.ids();
    },
    getSessionStateSnapshot: (sessionID: string): SessionState | undefined => {
      return sessionStore.snapshot(sessionID);
    },
    upsertSessionState: (
      sessionID: string,
      mutator: (state: SessionState) => void,
    ): void => {
      sessionStore.upsert(sessionID, mutator);
    },
    resetSessionState: (): void => {
      sessionStore.reset();
    },
    getSeedCount: (sessionID: string): number => {
      return sessionStore.get(sessionID)?.seedCount ?? 0;
    },
  }),
);

export default openCodeRulesPlugin;
export { __testOnly };
