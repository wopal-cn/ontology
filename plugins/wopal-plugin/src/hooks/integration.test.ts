import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import path from "path";
import os from "os";
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "fs";
import { resetSessionState, getSeedCount, setSessionStateLimit, getSessionStateIDs, upsertSessionState, getSessionStateSnapshot } from "../test-helpers.js";

// Test directories - initialized in setupTestDirs
let testDir: string;
let globalRulesDir: string;
let projectRulesDir: string;

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

  it("should return transform hooks when rules exist", async () => {
    // Arrange
    writeFileSync(path.join(globalRulesDir, "rule.md"), "# Test Rule");

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

      // Assert
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

  it("should inject rules into system prompt via system.transform hook", async () => {
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
      const systemTransform = hooks[
        "experimental.chat.system.transform"
      ] as any;
      const result = await systemTransform(
        { model: { providerID: "test", modelID: "test" } },
        { system: ["You are a helpful assistant."] },
      );

      // Assert
      expect(result.system.join("\n")).toContain(
        "You are a helpful assistant.",
      );
      expect(result.system.join("\n")).toContain("OpenCode Rules");
      expect(result.system.join("\n")).toContain("Test Rule");
    } finally {
      process.env.XDG_CONFIG_HOME = originalEnv;
    }
  });

  it("should append rules to existing system prompt", async () => {
    // Arrange
    writeFileSync(path.join(globalRulesDir, "rule.md"), "# My Rule");

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
      const systemTransform = hooks[
        "experimental.chat.system.transform"
      ] as any;
      const result = await systemTransform(
        { model: { providerID: "test", modelID: "test" } },
        { system: ["Original system prompt."] },
      );

      // Assert - original comes first, rules appended
      expect(result.system.join("\n")).toContain("Original system prompt.");
      expect(result.system.join("\n")).toContain("My Rule");
    } finally {
      process.env.XDG_CONFIG_HOME = originalEnv;
    }
  });

  it("should handle empty system prompt", async () => {
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
      const systemTransform = hooks[
        "experimental.chat.system.transform"
      ] as any;
      const result = await systemTransform(
        { model: { providerID: "test", modelID: "test" } },
        { system: [] },
      );

      // Assert
      expect(result.system.join("\n")).toContain("OpenCode Rules");
      expect(result.system.join("\n")).toContain("Rule Content");
    } finally {
      process.env.XDG_CONFIG_HOME = originalEnv;
    }
  });

  it("should not modify messages in messages.transform hook", async () => {
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

      // Assert - messages unchanged
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
              role: "assistant",
              parts: [
                {
                  sessionID: testSessionID,
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

        const systemOutput: any = {
          system: ["Base prompt."],
        };

        // First, process messages with a matching file reference
        const messagesTransform = hooks[
          "experimental.chat.messages.transform"
        ] as any;
        await messagesTransform({}, messagesOutput);

        // Then, get the system prompt with sessionID in input
        const systemTransform = hooks[
          "experimental.chat.system.transform"
        ] as any;
        const result = await systemTransform(
          {
            sessionID: testSessionID,
            model: { providerID: "test", modelID: "test" },
          },
          systemOutput,
        );

        // Assert - conditional rule should be included
        expect(result.system.join("\n")).toContain("React best practices");
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
              role: "assistant",
              parts: [
                {
                  sessionID: testSessionID,
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

        const systemOutput: any = {
          system: ["Base prompt."],
        };

        // Process messages with NON-matching file reference
        const messagesTransform = hooks[
          "experimental.chat.messages.transform"
        ] as any;
        await messagesTransform({}, messagesOutput);

        // Get the system prompt with sessionID in input
        const systemTransform = hooks[
          "experimental.chat.system.transform"
        ] as any;
        const result = await systemTransform(
          {
            sessionID: testSessionID,
            model: { providerID: "test", modelID: "test" },
          },
          systemOutput,
        );

        // Assert - conditional rule should NOT be included
        expect(result.system.join("\n")).not.toContain("React best practices");
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

        // Create messages with sessionID in parts (as OpenCode does)
        const testSessionID = "test-session-789";
        const messagesOutput: any = {
          messages: [
            {
              role: "user",
              parts: [
                {
                  sessionID: testSessionID,
                  type: "text",
                  text: "Check src/index.ts",
                },
              ],
            },
          ],
        };

        const systemOutput: any = {
          system: [],
        };

        // Process with non-matching context
        const messagesTransform = hooks[
          "experimental.chat.messages.transform"
        ] as any;
        await messagesTransform({}, messagesOutput);

        const systemTransform = hooks[
          "experimental.chat.system.transform"
        ] as any;
        const result = await systemTransform(
          {
            sessionID: testSessionID,
            model: { providerID: "test", modelID: "test" },
          },
          systemOutput,
        );

        // Assert
        expect(result.system.join("\n")).toContain("Always Apply");
        expect(result.system.join("\n")).toContain("This rule always applies");
        expect(result.system).not.toContain("Special rule content");
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

        // Create messages with sessionID in parts (as OpenCode does)
        const testSessionID = "test-session-multi";
        const messagesOutput: any = {
          messages: [
            {
              role: "assistant",
              parts: [
                {
                  sessionID: testSessionID,
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

        const systemOutput: any = {
          system: [],
        };

        // Process with one matching and one non-matching file
        const messagesTransform = hooks[
          "experimental.chat.messages.transform"
        ] as any;
        await messagesTransform({}, messagesOutput);

        const systemTransform = hooks[
          "experimental.chat.system.transform"
        ] as any;
        const result = await systemTransform(
          {
            sessionID: testSessionID,
            model: { providerID: "test", modelID: "test" },
          },
          systemOutput,
        );

        // Assert - rule should be included because at least one file matches
        expect(result.system.join("\n")).toContain("testing best practices");
      } finally {
        process.env.XDG_CONFIG_HOME = originalEnv;
      }
    });
  });
});