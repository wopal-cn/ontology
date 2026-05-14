import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import path from "path";
import os from "os";
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "fs";
import { resetSessionState, getSessionStateSnapshot, _upsertSessionState } from "../test-helpers.js";

// Test directories - initialized in setupTestDirs
let testDir: string;
let globalRulesDir: string;
let projectRulesDir: string;
let savedInjectionEnv: Record<string, string | undefined>;

function setupTestDirs() {
  // Create a unique temporary directory for each test run
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

// Save and clear injection toggle env vars so tests aren't affected by external config
function saveAndClearInjectionEnv() {
  savedInjectionEnv = {
    WOPAL_RULES_INJECTION_ENABLED: process.env.WOPAL_RULES_INJECTION_ENABLED,
    WOPAL_MEMORY_INJECTION_ENABLED: process.env.WOPAL_MEMORY_INJECTION_ENABLED,
  };
  delete process.env.WOPAL_RULES_INJECTION_ENABLED;
  delete process.env.WOPAL_MEMORY_INJECTION_ENABLED;
}

function restoreInjectionEnv() {
  if (savedInjectionEnv.WOPAL_RULES_INJECTION_ENABLED !== undefined) {
    process.env.WOPAL_RULES_INJECTION_ENABLED = savedInjectionEnv.WOPAL_RULES_INJECTION_ENABLED;
  }
  if (savedInjectionEnv.WOPAL_MEMORY_INJECTION_ENABLED !== undefined) {
    process.env.WOPAL_MEMORY_INJECTION_ENABLED = savedInjectionEnv.WOPAL_MEMORY_INJECTION_ENABLED;
  }
}

describe("message-hooks", () => {
  beforeEach(() => {
    setupTestDirs();
    saveAndClearInjectionEnv();
  });

  afterEach(async () => {
    teardownTestDirs();
    resetSessionState();
    restoreInjectionEnv();
  });

  it("updates lastUserPrompt from chat.message", async () => {
    const { default: pluginDef } = await import("../index.js");
    const plugin = (pluginDef as { server: Function }).server.bind(pluginDef);
    const hooks = await plugin({
      client: {} as any,
      project: {} as any,
      directory: testDir,
      worktree: testDir,
      $: {} as any,
      serverUrl: new URL("http://localhost"),
    });

    const hook = hooks["chat.message"] as any;
    expect(hook).toBeTypeOf("function");

    await hook(
      { sessionID: "ses_test" },
      {
        message: { role: "user" },
        parts: [{ type: "text", text: "please add tests" }],
      },
    );

    const snapshot = getSessionStateSnapshot("ses_test");
    expect(snapshot?.lastUserPrompt).toBe("please add tests");
  });

  it("includes glob-conditional rule when tool hook records matching file path", async () => {
    // Arrange rules
    const originalEnv = process.env.XDG_CONFIG_HOME;
    process.env.XDG_CONFIG_HOME = path.join(testDir, ".config");

    try {
      writeFileSync(
        path.join(globalRulesDir, "typescript.mdc"),
        `---
globs:
  - "src/components/**/*.tsx"
---

Use React best practices.`,
      );

      const { default: pluginDef } = await import("../index.js");
      const plugin = (pluginDef as { server: Function }).server.bind(pluginDef);
      const mockClient = { tool: { ids: vi.fn(async () => ({ data: [] })) } };
      const hooks = await plugin({
        client: mockClient as any,
        project: {} as any,
        directory: testDir,
        worktree: testDir,
        $: {} as any,
        serverUrl: new URL("http://localhost"),
      });

      // Act: record file path via tool hook
      const before = hooks["tool.execute.before"] as any;
      expect(before).toBeDefined();

      await before(
        { tool: "read", sessionID: "ses_1", callID: "call_1" },
        { args: { filePath: "src/components/Button.tsx" } },
      );

      // Now call messages.transform with a user message
      const messagesTransform = hooks[
        "experimental.chat.messages.transform"
      ] as any;
      const messagesResult = await messagesTransform(
        {},
        {
          messages: [
            {
              role: "user",
              info: { sessionID: "ses_1", role: "user" },
              parts: [{ type: "text", text: "write a button component" }],
            },
          ],
        },
      );

      // Assert - rules should be injected into the user message as a synthetic part
      const lastMsg = messagesResult.messages.find(
        (m: any) => m.role === "user" || m.info?.role === "user",
      );
      const syntheticParts = (lastMsg.parts as any[]).filter(
        (p: any) => p.synthetic,
      );
      const rulesText = syntheticParts
        .map((p: any) => p.text)
        .join("\n");
      expect(rulesText).toContain("React best practices");
    } finally {
      process.env.XDG_CONFIG_HOME = originalEnv;
    }
  });
});