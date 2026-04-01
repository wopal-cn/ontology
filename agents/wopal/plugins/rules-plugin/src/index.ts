/**
 * OpenCode Rules Plugin
 *
 * Discovers markdown rule files and injects them into the system prompt.
 * Also provides non-blocking task delegation tools (wopal_task, wopal_output, wopal_cancel).
 */

import type { PluginInput, Hooks } from "@opencode-ai/plugin";
import { discoverRuleFiles } from "./utils.js";
import { OpenCodeRulesRuntime } from "./runtime.js";
import { createSessionStore, type SessionState } from "./session-store.js";
import { createDebugLog, createWarnLog } from "./debug.js";
import { SimpleTaskManager } from "./simple-task-manager.js";
import { createWopalTools } from "./tools/index.js";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

const sessionStore = createSessionStore();

const debugLog = createDebugLog();
const warnLog = createWarnLog("[wopal-plugin]");

function loadWopalEnv(rootDir: string): void {
  const envPath = join(rootDir, ".env");
  if (!existsSync(envPath)) return;

  try {
    const content = readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
      if (key.startsWith("WOPAL_") && !process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // Silently ignore .env read errors
  }
}

let _memorySystem: {
  injector: import("./memory/injector").MemoryInjector;
  distillEngine: import("./memory/distill").DistillEngine;
  store: import("./memory/store").MemoryStore;
  embedder: import("./memory/embedder").EmbeddingClient;
} | null = null;

async function ensureMemorySystem(
  _client: unknown,
  _taskManager: SimpleTaskManager,
): Promise<typeof _memorySystem> {
  if (_memorySystem) return _memorySystem;

  try {
    const { MemoryStore } = await import("./memory/store");
    const { EmbeddingClient } = await import("./memory/embedder");
    const { DistillLLMClient } = await import("./memory/llm-client");
    const { DistillEngine } = await import("./memory/distill");
    const { MemoryRetriever } = await import("./memory/retriever");
    const { MemoryInjector } = await import("./memory/injector");

    const store = new MemoryStore();
    await store.init();

    const embedder = new EmbeddingClient();
    const llm = new DistillLLMClient();
    const distillEngine = new DistillEngine(store, embedder, llm);
    const retriever = new MemoryRetriever(store, embedder);
    const injector = new MemoryInjector(retriever);

    _memorySystem = { injector, distillEngine, store, embedder };
    debugLog("Memory system initialized (LanceDB + Embedding + LLM)");
    return _memorySystem;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warnLog(`Memory system initialization failed (non-fatal): ${message}`);
    return null;
  }
}

const openCodeRulesPlugin = async (pluginInput: PluginInput): Promise<Hooks> => {
  debugLog(`Plugin loaded! directory: ${pluginInput.directory}`);

  loadWopalEnv(pluginInput.directory);

  const ruleFiles = await discoverRuleFiles(pluginInput.directory);
  debugLog(`Discovered ${ruleFiles.length} rule file(s)`);
    debugLog(`Tools registered: wopal_task, wopal_output, wopal_cancel, distill_session, memory_manage`);

  const taskManager = new SimpleTaskManager(
    pluginInput.client,
    pluginInput.directory,
  );

  const memory = await ensureMemorySystem(pluginInput.client, taskManager);

  const runtime = new OpenCodeRulesRuntime({
    client: pluginInput.client,
    directory: pluginInput.directory,
    projectDirectory: pluginInput.directory,
    ruleFiles,
    sessionStore,
    debugLog,
    taskManager,
    memoryInjector: memory?.injector,
  });

  const hooks = runtime.createHooks();

  const tools = createWopalTools(taskManager, memory?.store, memory?.embedder, sessionStore);

  if (memory) {
    const { createDistillSessionTool } = await import("./tools/distill-session");
    tools.distill_session = createDistillSessionTool(
      memory.distillEngine,
      memory.store,
      pluginInput.client,
    );
  }

  warnLog(`Returning tools: ${Object.keys(tools).join(", ")}, memory: ${!!memory}`);

  return {
    ...hooks,
    tool: tools,
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
