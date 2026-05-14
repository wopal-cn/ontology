import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import path from "path";
import os from "os";
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "fs";
import { resetSessionState, getSeedCount, upsertSessionState, getSessionStateSnapshot } from "../test-helpers.js"

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

describe("OpenCodeRulesPlugin", () => {
  beforeEach(() => {
    setupTestDirs();
    saveAndClearInjectionEnv();
  });

  afterEach(() => {
    teardownTestDirs();
    vi.resetAllMocks();
    resetSessionState();
    restoreInjectionEnv();
  });

  it("should export a default plugin function", async () => {
    const { default: pluginDef } = await import("../index.js");
      const plugin = (pluginDef as { server: Function }).server.bind(pluginDef);
    expect(typeof plugin).toBe("function");
  });

  it("should return transform hooks even when no rules exist", async () => {
    // Arrange
    const originalEnv = process.env.XDG_CONFIG_HOME;
    process.env.XDG_CONFIG_HOME = path.join(testDir, "empty-config");
    mkdirSync(path.join(testDir, "empty-config", "opencode", "rules"), {
      recursive: true,
    });

    const { default: pluginDef } = await import("../index.js");
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
      // Act
      const hooks = await plugin(mockInput);

      // Assert - hooks are returned even when no rules exist
      // They handle the empty case gracefully
      expect("experimental.chat.messages.transform" in hooks).toBe(true);
      expect("experimental.chat.system.transform" in hooks).toBe(true);
      expect(typeof hooks["experimental.chat.messages.transform"]).toBe(
        "function",
      );
      expect(typeof hooks["experimental.chat.system.transform"]).toBe(
        "function",
      );
    } finally {
      process.env.XDG_CONFIG_HOME = originalEnv;
    }
  });

  it("should inject rules into user message via messages.transform hook", async () => {
    // Arrange
    writeFileSync(
      path.join(globalRulesDir, "rule.md"),
      "# Test Rule\nDo this always",
    );

    const originalEnv = process.env.XDG_CONFIG_HOME;
    process.env.XDG_CONFIG_HOME = path.join(testDir, ".config");

    const { default: pluginDef } = await import("../index.js");
      const plugin = (pluginDef as { server: Function }).server.bind(pluginDef);
    const mockInput = {
      client: {} as any,
      project: {} as any,
      directory: testDir,
      worktree: testDir,
      $: {} as any,
      serverUrl: new URL("http://localhost:3000"),
    };

    try {
      // Act
      const hooks = await plugin(mockInput);
      const messagesTransform = hooks[
        "experimental.chat.messages.transform"
      ] as any;
      const result = await messagesTransform(
        {},
        {
          messages: [
            {
              role: "user",
              info: { sessionID: "test-ses", role: "user" },
              parts: [{ type: "text", text: "hello" }],
            },
          ],
        },
      );

      // Assert - rules injected as synthetic part in user message
      const userMsg = result.messages[0];
      const syntheticParts = (userMsg.parts as any[]).filter(
        (p: any) => p.synthetic,
      );
      const rulesText = syntheticParts.map((p: any) => p.text).join("\n");
      expect(rulesText).toContain("OpenCode Rules");
      expect(rulesText).toContain("Test Rule");
    } finally {
      process.env.XDG_CONFIG_HOME = originalEnv;
    }
  });

  it("should inject rules into user message with empty system prompt", async () => {
    // Arrange
    writeFileSync(path.join(globalRulesDir, "rule.md"), "# Rule Content");

    const originalEnv = process.env.XDG_CONFIG_HOME;
    process.env.XDG_CONFIG_HOME = path.join(testDir, ".config");

    const { default: pluginDef } = await import("../index.js");
      const plugin = (pluginDef as { server: Function }).server.bind(pluginDef);
    const mockInput = {
      client: {} as any,
      project: {} as any,
      directory: testDir,
      worktree: testDir,
      $: {} as any,
      serverUrl: new URL("http://localhost:3000"),
    };

    try {
      // Act
      const hooks = await plugin(mockInput);
      const messagesTransform = hooks[
        "experimental.chat.messages.transform"
      ] as any;
      const result = await messagesTransform(
        {},
        {
          messages: [
            {
              role: "user",
              info: { sessionID: "test-ses", role: "user" },
              parts: [{ type: "text", text: "hello" }],
            },
          ],
        },
      );

      // Assert - rules injected as synthetic part
      const userMsg = result.messages[0];
      const syntheticParts = (userMsg.parts as any[]).filter(
        (p: any) => p.synthetic,
      );
      const rulesText = syntheticParts.map((p: any) => p.text).join("\n");
      expect(rulesText).toContain("OpenCode Rules");
      expect(rulesText).toContain("Rule Content");
    } finally {
      process.env.XDG_CONFIG_HOME = originalEnv;
    }
  });

  it("should not modify messages in messages.transform hook when no skill reload needed", async () => {
    // Arrange
    writeFileSync(path.join(globalRulesDir, "rule.md"), "# Rule");

    const originalEnv = process.env.XDG_CONFIG_HOME;
    process.env.XDG_CONFIG_HOME = path.join(testDir, ".config");

    const { default: pluginDef } = await import("../index.js");
      const plugin = (pluginDef as { server: Function }).server.bind(pluginDef);
    const mockInput = {
      client: {} as any,
      project: {} as any,
      directory: testDir,
      worktree: testDir,
      $: {} as any,
      serverUrl: new URL("http://localhost:3000"),
    };

    const originalMessages = [
      {
        role: "user",
        parts: [{ sessionID: "test-123", type: "text", text: "Hello" }],
      },
    ];

    try {
      // Act
      const hooks = await plugin(mockInput);
      const messagesTransform = hooks[
        "experimental.chat.messages.transform"
      ] as any;
      const result = await messagesTransform(
        {},
        { messages: originalMessages },
      );

      // Assert - messages unchanged when no skill reload needed
      // (Skill Reload only adds synthetic part when needsSkillReload is true)
      expect(result.messages).toEqual(originalMessages);
    } finally {
      process.env.XDG_CONFIG_HOME = originalEnv;
    }
  });

  it("seeds session state once from messages.transform and does not rescan", async () => {
    // Arrange
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

    const transform = hooks["experimental.chat.messages.transform"] as any;

    const messages = {
      messages: [
        {
          info: { role: "assistant" },
          parts: [
            {
              sessionID: "ses_seed",
              type: "tool-invocation",
              toolInvocation: {
                toolName: "read",
                args: { filePath: "src/a.ts" },
              },
            },
          ],
        },
      ],
    };

    // Act - call transform twice with same messages
    await transform({}, messages);
    await transform({}, messages);

    // Assert - should only seed once
    expect(getSeedCount("ses_seed")).toBe(1);
  });

  describe("conditional rules integration", () => {
    it("should include conditional rule when message context matches glob", async () => {
      // Arrange
      writeFileSync(
        path.join(globalRulesDir, "typescript.mdc"),
        `---
globs:
  - "src/components/**/*.tsx"
---

Use React best practices for components.`,
      );

      const originalEnv = process.env.XDG_CONFIG_HOME;
      process.env.XDG_CONFIG_HOME = path.join(testDir, ".config");

      const { default: pluginDef } = await import("../index.js");
      const plugin = (pluginDef as { server: Function }).server.bind(pluginDef);
      const mockInput = {
        client: {} as any,
        project: {} as any,
        directory: testDir,
        worktree: testDir,
        $: {} as any,
        serverUrl: new URL("http://localhost:3000"),
      };

      try {
        // Act
        const hooks = await plugin(mockInput);

        // Create messages with sessionID in parts (as OpenCode does)
        const testSessionID = "test-session-123";
        const messagesOutput: any = {
          messages: [
            {
              role: "user",
              info: { sessionID: testSessionID, role: "user" },
              parts: [{ type: "text", text: "write a component" }],
            },
            {
              role: "assistant",
              parts: [
                {
                  type: "tool-invocation",
                  toolInvocation: {
                    toolName: "read",
                    args: { filePath: "src/components/Button.tsx" },
                  },
                },
              ],
            },
          ],
        };

        // messages.transform seeds context AND injects rules
        const messagesTransform = hooks[
          "experimental.chat.messages.transform"
        ] as any;
        const result = await messagesTransform({}, messagesOutput);

        // Assert - conditional rule should be injected to user message as synthetic
        const userMsg = result.messages[0];
        const syntheticParts = (userMsg.parts as any[]).filter(
          (p: any) => p.synthetic,
        );
        const rulesText = syntheticParts.map((p: any) => p.text).join("\n");
        expect(rulesText).toContain("React best practices");
      } finally {
        process.env.XDG_CONFIG_HOME = originalEnv;
      }
    });

    it("should exclude conditional rule when message context does not match glob", async () => {
      // Arrange
      writeFileSync(
        path.join(globalRulesDir, "typescript.mdc"),
        `---
globs:
  - "src/components/**/*.tsx"
---

Use React best practices for components.`,
      );

      const originalEnv = process.env.XDG_CONFIG_HOME;
      process.env.XDG_CONFIG_HOME = path.join(testDir, ".config");

      const { default: pluginDef } = await import("../index.js");
      const plugin = (pluginDef as { server: Function }).server.bind(pluginDef);
      const mockInput = {
        client: {} as any,
        project: {} as any,
        directory: testDir,
        worktree: testDir,
        $: {} as any,
        serverUrl: new URL("http://localhost:3000"),
      };

      try {
        // Act
        const hooks = await plugin(mockInput);

        // Create messages with sessionID in parts (as OpenCode does)
        const testSessionID = "test-session-456";
        const messagesOutput: any = {
          messages: [
            {
              role: "user",
              info: { sessionID: testSessionID, role: "user" },
              parts: [{ type: "text", text: "hi" }],
            },
            {
              role: "assistant",
              parts: [
                {
                  type: "tool-invocation",
                  toolInvocation: {
                    toolName: "read",
                    args: { filePath: "src/utils/helpers.ts" },
                  },
                },
              ],
            },
          ],
        };

        // Process messages with NON-matching file reference
        const messagesTransform = hooks[
          "experimental.chat.messages.transform"
        ] as any;
        const result = await messagesTransform({}, messagesOutput);

        // Assert - conditional rule should NOT be injected
        const userMsg = result.messages[0];
        const syntheticParts = (userMsg.parts as any[]).filter(
          (p: any) => p.synthetic,
        );
        const rulesText = syntheticParts.map((p: any) => p.text).join("\n");
        expect(rulesText).not.toContain("React best practices");
      } finally {
        process.env.XDG_CONFIG_HOME = originalEnv;
      }
    });

    it("should include unconditional rules regardless of context", async () => {
      // Arrange
      writeFileSync(
        path.join(globalRulesDir, "always.md"),
        "# Always Apply\nThis rule always applies.",
      );
      writeFileSync(
        path.join(globalRulesDir, "conditional.mdc"),
        `---
globs:
  - "src/special/**/*"
---

Special rule content.`,
      );

      const originalEnv = process.env.XDG_CONFIG_HOME;
      process.env.XDG_CONFIG_HOME = path.join(testDir, ".config");

      const { default: pluginDef } = await import("../index.js");
      const plugin = (pluginDef as { server: Function }).server.bind(pluginDef);
      const mockInput = {
        client: {} as any,
        project: {} as any,
        directory: testDir,
        worktree: testDir,
        $: {} as any,
        serverUrl: new URL("http://localhost:3000"),
      };

      try {
        // Act
        const hooks = await plugin(mockInput);

        // Process with non-matching context
        const messagesTransform = hooks[
          "experimental.chat.messages.transform"
        ] as any;
        const result = await messagesTransform(
          {},
          {
            messages: [
              {
                role: "user",
                info: { sessionID: "test-session-789", role: "user" },
                parts: [{ type: "text", text: "Check src/index.ts" }],
              },
            ],
          },
        );

        // Assert
        const userMsg = result.messages[0];
        const syntheticParts = (userMsg.parts as any[]).filter(
          (p: any) => p.synthetic,
        );
        const rulesText = syntheticParts.map((p: any) => p.text).join("\n");
        expect(rulesText).toContain("Always Apply");
        expect(rulesText).toContain("This rule always applies");
        expect(rulesText).not.toContain("Special rule content");
      } finally {
        process.env.XDG_CONFIG_HOME = originalEnv;
      }
    });

    it("should handle multiple matching files for conditional rules", async () => {
      // Arrange
      writeFileSync(
        path.join(globalRulesDir, "multi.mdc"),
        `---
globs:
  - "**/*.test.ts"
---

Follow testing best practices.`,
      );

      const originalEnv = process.env.XDG_CONFIG_HOME;
      process.env.XDG_CONFIG_HOME = path.join(testDir, ".config");

      const { default: pluginDef } = await import("../index.js");
      const plugin = (pluginDef as { server: Function }).server.bind(pluginDef);
      const mockInput = {
        client: {} as any,
        project: {} as any,
        directory: testDir,
        worktree: testDir,
        $: {} as any,
        serverUrl: new URL("http://localhost:3000"),
      };

      try {
        // Act
        const hooks = await plugin(mockInput);

        const testSessionID = "test-session-multi";
        const messagesOutput: any = {
          messages: [
            {
              role: "user",
              info: { sessionID: testSessionID, role: "user" },
              parts: [{ type: "text", text: "add tests" }],
            },
            {
              role: "assistant",
              parts: [
                {
                  type: "tool-invocation",
                  toolInvocation: {
                    toolName: "read",
                    args: { filePath: "src/utils.ts" },
                  },
                },
                {
                  type: "tool-invocation",
                  toolInvocation: {
                    toolName: "read",
                    args: { filePath: "src/utils.test.ts" },
                  },
                },
              ],
            },
          ],
        };

        // Process with one matching and one non-matching file
        const messagesTransform = hooks[
          "experimental.chat.messages.transform"
        ] as any;
        const result = await messagesTransform({}, messagesOutput);

        // Assert - rule should be included because at least one file matches
        const userMsg = result.messages[0];
        const syntheticParts = (userMsg.parts as any[]).filter(
          (p: any) => p.synthetic,
        );
        const rulesText = syntheticParts.map((p: any) => p.text).join("\n");
        expect(rulesText).toContain("testing best practices");
      } finally {
        process.env.XDG_CONFIG_HOME = originalEnv;
      }
    });
  });

  it("system.transform no longer injects rules (rules moved to messages.transform)", async () => {
    // Arrange - create conditional rule
    const originalEnv = process.env.XDG_CONFIG_HOME;
    process.env.XDG_CONFIG_HOME = path.join(testDir, ".config");

    try {
      writeFileSync(
        path.join(globalRulesDir, "conditional.mdc"),
        `---
globs:
  - "src/special/**/*"
---

Special rule content.`,
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

      // Seed state directly (without calling messages.transform)
      upsertSessionState("ses_x", (s) =>
        s.contextPaths.add("src/special/a.txt"),
      );

      // Act: call system.transform directly
      const systemTransform = hooks[
        "experimental.chat.system.transform"
      ] as any;
      const result = await systemTransform(
        { sessionID: "ses_x", model: { providerID: "test", modelID: "test" } },
        { system: ["Base prompt."] },
      );

      // Assert - system.transform no longer injects rules
      expect(result.system.join("\n")).not.toContain("Special rule content");
      expect(result.system.join("\n")).toContain("Base prompt.");
    } finally {
      process.env.XDG_CONFIG_HOME = originalEnv;
    }
  });
});

describe("Skill Reload Migration", () => {
  beforeEach(() => {
    setupTestDirs();
    saveAndClearInjectionEnv();
  });

  afterEach(() => {
    teardownTestDirs();
    vi.resetAllMocks();
    resetSessionState();
    restoreInjectionEnv();
  });

  it("injects Skill Reload reminder as synthetic part in user message (U1)", async () => {
    // Arrange
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

    const sessionID = "ses_skill_reload_test";
    upsertSessionState(sessionID, (s) => {
      s.loadedSkills = new Set(["dev-flow", "fae-collab"]);
      s.needsSkillReload = true;
    });

    const messages = [
      { info: { role: "user", sessionID }, parts: [{ type: "text", text: "hello" }] },
      { info: { role: "assistant", sessionID }, parts: [{ type: "text", text: "response" }] },
    ];

    // Act
    const messagesTransform = hooks["experimental.chat.messages.transform"] as any;
    const result = await messagesTransform({}, { messages });

    // Assert - last user message contains synthetic Skill Reload part
    const lastUserMsg = result.messages[0];
    const syntheticPart = lastUserMsg.parts.find((p: any) => p.synthetic === true);
    expect(syntheticPart).toBeDefined();
    expect(syntheticPart.type).toBe("text");
    expect(syntheticPart.text).toContain("<system-reminder>");
    expect(syntheticPart.text).toContain("dev-flow");
    expect(syntheticPart.text).toContain("fae-collab");
  });

  it("Skill Reload is one-time consumption (U2)", async () => {
    // Arrange
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

    const sessionID = "ses_skill_reload_once";
    upsertSessionState(sessionID, (s) => {
      s.loadedSkills = new Set(["dev-flow"]);
      s.needsSkillReload = true;
    });

    const messages1 = [
      { info: { role: "user", sessionID }, parts: [{ type: "text", text: "first" }] },
    ];

    const messages2 = [
      { info: { role: "user", sessionID }, parts: [{ type: "text", text: "second" }] },
    ];

    // Act - first call
    const messagesTransform = hooks["experimental.chat.messages.transform"] as any;
    const result1 = await messagesTransform({}, { messages: messages1 });

    // Assert - Skill Reload injected
    const synthetic1 = result1.messages[0].parts.find((p: any) => p.synthetic === true);
    expect(synthetic1).toBeDefined();

    // Act - second call
    const result2 = await messagesTransform({}, { messages: messages2 });

    // Assert - no Skill Reload (already consumed)
    const synthetic2 = result2.messages[0].parts.find((p: any) => p.synthetic === true);
    expect(synthetic2).toBeUndefined();
  });

  it("does not inject when no Skill Reload needed (U3)", async () => {
    // Arrange
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

    const sessionID = "ses_no_skill_reload";
    upsertSessionState(sessionID, (s) => {
      s.loadedSkills = new Set();
      // No needsSkillReload set
    });

    const messages = [
      { info: { role: "user", sessionID }, parts: [{ type: "text", text: "hello" }] },
    ];

    // Act
    const messagesTransform = hooks["experimental.chat.messages.transform"] as any;
    const result = await messagesTransform({}, { messages });

    // Assert - no synthetic part
    const syntheticPart = result.messages[0].parts.find((p: any) => p.synthetic === true);
    expect(syntheticPart).toBeUndefined();
  });

  it("skips Skill Reload injection when no user message (U4)", async () => {
    // Arrange
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

    const sessionID = "ses_no_user_msg";
    upsertSessionState(sessionID, (s) => {
      s.loadedSkills = new Set(["dev-flow"]);
      s.needsSkillReload = true;
    });

    const messages = [
      { info: { role: "assistant", sessionID }, parts: [{ type: "text", text: "response" }] },
    ];

    // Act
    const messagesTransform = hooks["experimental.chat.messages.transform"] as any;
    const result = await messagesTransform({}, { messages });

    // Assert - no error, no synthetic part (no user message to inject into)
    expect(result.messages).toEqual(messages);
  });

  it("stores transformed messages in map (U5)", async () => {
    // Arrange
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

    const sessionID = "ses_transformed_map";
    upsertSessionState(sessionID, (s) => {
      s.loadedSkills = new Set(["dev-flow"]);
      s.needsSkillReload = true;
    });

    const messages = [
      { info: { role: "user", sessionID }, parts: [{ type: "text", text: "hello" }] },
    ];

    // Act
    const messagesTransform = hooks["experimental.chat.messages.transform"] as any;
    const result = await messagesTransform({}, { messages });

    // Assert - transformedMessagesMap should contain the messages with synthetic part
    // The map is internal to hooks, so we verify via result having synthetic part
    expect(result.messages[0].parts.find((p: any) => p.synthetic === true)).toBeDefined();
  });

  it("seededFromHistory does not block Skill Reload injection (U6)", async () => {
    // Arrange
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

    const sessionID = "ses_seeded_skill_reload";
    upsertSessionState(sessionID, (s) => {
      s.seededFromHistory = true;
      s.loadedSkills = new Set(["dev-flow"]);
      s.needsSkillReload = true;
    });

    const messages = [
      { info: { role: "user", sessionID }, parts: [{ type: "text", text: "continue" }] },
    ];

    // Act
    const messagesTransform = hooks["experimental.chat.messages.transform"] as any;
    const result = await messagesTransform({}, { messages });

    // Assert - Skill Reload injected despite seededFromHistory
    const syntheticPart = result.messages[0].parts.find((p: any) => p.synthetic === true);
    expect(syntheticPart).toBeDefined();
    expect(syntheticPart.text).toContain("dev-flow");
  });

  it("does not consume Skill Reload when no user message (U7)", async () => {
    // Arrange
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

    const sessionID = "ses_preserve_skill_reload";
    upsertSessionState(sessionID, (s) => {
      s.loadedSkills = new Set(["dev-flow"]);
      s.needsSkillReload = true;
    });

    // First call - no user message
    const messages1 = [
      { info: { role: "assistant", sessionID }, parts: [{ type: "text", text: "response" }] },
    ];

    const messagesTransform = hooks["experimental.chat.messages.transform"] as any;
    await messagesTransform({}, { messages: messages1 });

    // Assert - needsSkillReload still true (not consumed)
    const state1 = getSessionStateSnapshot(sessionID);
    expect(state1?.needsSkillReload).toBe(true);

    // Second call - with user message
    const messages2 = [
      { info: { role: "user", sessionID }, parts: [{ type: "text", text: "hello" }] },
    ];

    const result2 = await messagesTransform({}, { messages: messages2 });

    // Assert - Skill Reload now injected (consumed)
    const synthetic2 = result2.messages[0].parts.find((p: any) => p.synthetic === true);
    expect(synthetic2).toBeDefined();
  });

  it("system.transform no longer injects Skill Reload (I1)", async () => {
    // Arrange
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

    const sessionID = "ses_system_no_reload";
    upsertSessionState(sessionID, (s) => {
      s.loadedSkills = new Set(["dev-flow"]);
      s.needsSkillReload = true;
    });

    // Act
    const systemTransform = hooks["experimental.chat.system.transform"] as any;
    const result = await systemTransform(
      { sessionID, model: { providerID: "test", modelID: "test" } },
      { system: ["Base prompt."] },
    );

    // Assert - system[] does not contain Skill Reload
    const systemText = result.system.join("\n");
    expect(systemText).not.toContain("[系统提醒]");
    expect(systemText).not.toContain("技能");
  });
});