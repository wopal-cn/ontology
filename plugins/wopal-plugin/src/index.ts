/**
 * OpenCode Rules Plugin
 *
 * Discovers markdown rule files and injects them into the system prompt.
 * Also provides non-blocking task delegation tools (wopal_task, wopal_task_output, wopal_task_cancel, wopal_task_reply, wopal_task_diff).
 */

import type { PluginInput, Hooks } from "@opencode-ai/plugin";
import { createOpencodeClient as createV2OpencodeClient } from "@opencode-ai/sdk/v2";
import { discoverRuleFiles } from "./utils.js";
import { OpenCodeRulesRuntime } from "./runtime.js";
import { sessionStore } from "./session-store-instance.js";
import { createDebugLog, createWarnLog } from "./debug.js";
import { SimpleTaskManager } from "./simple-task-manager.js";
import { createWopalTools } from "./tools/index.js";
import { existsSync, readFileSync } from "fs";
import { join } from "path";


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
  llm: import("./memory/llm-client").DistillLLMClient;
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

    _memorySystem = { injector, distillEngine, store, embedder, llm };
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
    debugLog(`Tools registered: wopal_task, wopal_task_output, wopal_task_cancel, wopal_task_reply, wopal_task_diff, memory_manage, context_manage`);

  // Extract the internal fetch from v1 client (which uses Server.Default().fetch
  // to route requests to the in-process Hono server, bypassing real HTTP).
  // We must pass it to v2 client so question.reply reaches the Question service.
  const internalFetch = (pluginInput.client as any)?._client?.getConfig?.()?.fetch ?? globalThis.fetch;

  const v2Client = createV2OpencodeClient({
    baseUrl: pluginInput.serverUrl.toString(),
    directory: pluginInput.directory,
    fetch: internalFetch,
  });

  const taskManager = new SimpleTaskManager(
    pluginInput.client,
    v2Client,
    pluginInput.directory,
    pluginInput.serverUrl,
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

  const tools = createWopalTools(taskManager, memory?.store, memory?.embedder, sessionStore, memory?.distillEngine, pluginInput.client);

  if (memory) {
    const { createContextManageTool } = await import("./tools/context-manage");

    tools.context_manage = createContextManageTool(
      memory.llm,
      pluginInput.client,
    );
  }

  debugLog(`Plugin initialized: tools=[${Object.keys(tools).join(", ")}], memory=${!!memory}`);

  return {
    ...hooks,
    tool: tools,
  };
};

export default {
  id: "wopal-wopal-plugin",
  server: openCodeRulesPlugin,
};
