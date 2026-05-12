import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import path from "path";
import os from "os";
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "fs";
import { resetSessionState, getSeedCount, setSessionStateLimit, getSessionStateIDs, upsertSessionState } from "./test-helpers.js";

let testDir: string;
let globalRulesDir: string;
let projectRulesDir: string;

function setupTestDirs() {
  testDir = mkdtempSync(path.join(os.tmpdir(), "opencode-rules-test-"));
  globalRulesDir = path.join(testDir, ".config", "opencode", "rules");
  projectRulesDir = path.join(testDir, "project", ".opencode", "rules");
  mkdirSync(globalRulesDir, { recursive: true });
  mkdirSync(projectRulesDir, { recursive: true });
}

function teardownTestDirs() {
  if (testDir) {
    rmSync(testDir, { recursive: true, force: true });
  }
}

describe("OpenCodeRulesPlugin", () => {
  beforeEach(() => {
    setupTestDirs();
  });

  afterEach(() => {
    teardownTestDirs();
    vi.resetAllMocks();
    resetSessionState();
  });

  it("should export a default plugin function", async () => {
    const { default: pluginDef } = await import("./index.js");
    const plugin = (pluginDef as { server: Function }).server.bind(pluginDef);
    expect(typeof plugin).toBe("function");
  });

  it("should return transform hooks even when no rules exist", async () => {
    const originalEnv = process.env.XDG_CONFIG_HOME;
    process.env.XDG_CONFIG_HOME = path.join(testDir, "empty-config");
    mkdirSync(path.join(testDir, "empty-config", "opencode", "rules"), {
      recursive: true,
    });

    const { default: pluginDef } = await import("./index.js");
    const plugin = (pluginDef as { server: Function }).server.bind(pluginDef);
    const mockInput = {
      client: {} as any,
      project: {} as any,
      directory: path.join(testDir, "empty-project"),
      worktree: testDir,
      $: {} as any,
      serverUrl: new URL("http://localhost:3000"),
    };

    try {
      const hooks = await plugin(mockInput);
      expect("experimental.chat.messages.transform" in hooks).toBe(true);
      expect("experimental.chat.system.transform" in hooks).toBe(true);
    } finally {
      process.env.XDG_CONFIG_HOME = originalEnv;
    }
  });

  it("should inject rules into system prompt via system.transform hook", async () => {
    writeFileSync(
      path.join(globalRulesDir, "rule.md"),
      "# Test Rule\nDo this always",
    );

    const originalEnv = process.env.XDG_CONFIG_HOME;
    process.env.XDG_CONFIG_HOME = path.join(testDir, ".config");

    const { default: pluginDef } = await import("./index.js");
    const plugin = (pluginDef as { server: Function }).server.bind(pluginDef);

    try {
      const hooks = await plugin({
        client: {} as any,
        project: {} as any,
        directory: testDir,
        worktree: testDir,
        $: {} as any,
        serverUrl: new URL("http://localhost:3000"),
      });

      const systemTransform = hooks[
        "experimental.chat.system.transform"
      ] as any;
      const result = await systemTransform(
        { model: { providerID: "test", modelID: "test" } },
        { system: ["You are a helpful assistant."] },
      );

      expect(result.system.join("\n")).toContain("You are a helpful assistant.");
      expect(result.system.join("\n")).toContain("Test Rule");
    } finally {
      process.env.XDG_CONFIG_HOME = originalEnv;
    }
  });

  it("seeds session state once from messages.transform and does not rescan", async () => {
    const { default: pluginDef } = await import("./index.js");
    const plugin = (pluginDef as { server: Function }).server.bind(pluginDef);
    const hooks = await plugin({
      client: {} as any,
      project: {} as any,
      directory: testDir,
      worktree: testDir,
      $: {} as any,
      serverUrl: new URL("http://localhost"),
    });

    const transform = hooks["experimental.chat.messages.transform"] as any;
    const messages = {
      messages: [
        {
          info: { role: "assistant" },
          parts: [
            {
              sessionID: "ses_seed",
              type: "tool-invocation",
              toolInvocation: { toolName: "read", args: { filePath: "src/a.ts" } },
            },
          ],
        },
      ],
    };

    await transform({}, messages);
    await transform({}, messages);

    expect(getSeedCount("ses_seed")).toBe(1);
  });
});

describe("SessionState", () => {
  beforeEach(() => {
    setupTestDirs();
  });

  afterEach(() => {
    teardownTestDirs();
    resetSessionState();
  });

  it("prunes session state when over limit", async () => {
    setSessionStateLimit(2);
    upsertSessionState("ses_1", (s) => void (s.lastUpdated = 1));
    upsertSessionState("ses_2", (s) => void (s.lastUpdated = 2));
    upsertSessionState("ses_3", (s) => void (s.lastUpdated = 3));

    const ids = getSessionStateIDs();
    expect(ids).toHaveLength(2);
    expect(ids).toContain("ses_2");
    expect(ids).toContain("ses_3");
  });

  it("registers memory command/tool hardening hooks", async () => {
    const { default: pluginDef } = await import("./index.js");
    const plugin = (pluginDef as { server: Function }).server.bind(pluginDef);
    const hooks = await plugin({
      client: { tool: { ids: vi.fn(async () => ({ data: [] })) } } as any,
      project: {} as any,
      directory: testDir,
      worktree: testDir,
      $: {} as any,
      serverUrl: new URL("http://localhost"),
    });

    expect(typeof hooks["command.execute.before"]).toBe("function");
    expect(typeof hooks["tool.execute.after"]).toBe("function");
    expect(typeof hooks["tool.definition"]).toBe("function");
  });

  it("hardens /memory command prompt before execution", async () => {
    const { default: pluginDef } = await import("./index.js");
    const plugin = (pluginDef as { server: Function }).server.bind(pluginDef);
    const hooks = await plugin({
      client: { tool: { ids: vi.fn(async () => ({ data: [] })) } } as any,
      project: {} as any,
      directory: testDir,
      worktree: testDir,
      $: {} as any,
      serverUrl: new URL("http://localhost"),
    });

    const hook = hooks["command.execute.before"] as any;
    const output = {
      parts: [{ type: "text", text: "# /memory — 记忆管理命令\n原始内容" }],
    };

    await hook({ command: "memory", sessionID: "ses_mem", arguments: "" }, output);

    expect(output.parts[0].text).toContain("这是一个立即执行命令");
    expect(output.parts[0].text).toContain("必须把工具返回的完整文本逐字写入回复");
    expect(output.parts[0].text).toContain("原始内容");
  });
});
