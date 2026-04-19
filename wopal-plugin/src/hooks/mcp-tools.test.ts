import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import path from "path";
import os from "os";
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "fs";
import { resetSessionState } from "../test-helpers.js";
import { extractConnectedMcpCapabilityIDs } from "./mcp-tools.js";

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

describe("extractConnectedMcpCapabilityIDs", () => {
  it("returns mcp_<sanitizedName> for connected servers", () => {
    const status = {
      context7: { status: "connected" },
      "my server": { status: "connected" },
      disabled: { status: "disabled" },
      disconnected: { status: "disconnected" },
    };

    expect(extractConnectedMcpCapabilityIDs(status)).toEqual([
      "mcp_context7",
      "mcp_my_server",
    ]);
  });

  it("returns [] for null/undefined/non-object", () => {
    expect(extractConnectedMcpCapabilityIDs(null)).toEqual([]);
    expect(extractConnectedMcpCapabilityIDs(undefined)).toEqual([]);
    expect(extractConnectedMcpCapabilityIDs("nope" as any)).toEqual([]);
  });

  it("ignores entries without status.connected", () => {
    const status = { context7: { status: "failed" } };
    expect(extractConnectedMcpCapabilityIDs(status)).toEqual([]);
  });
});

describe("mcp-tools integration", () => {
  beforeEach(() => {
    setupTestDirs();
  });

  afterEach(async () => {
    teardownTestDirs();
    resetSessionState();
  });

  it("includes rules gated by connected mcp server capability", async () => {
    // Arrange
    const ruleContent = `---
tools:
  - "mcp_context7"
---
MCP Context7 rule content`;
    writeFileSync(path.join(globalRulesDir, "context7.md"), ruleContent);

    const originalEnv = process.env.XDG_CONFIG_HOME;
    process.env.XDG_CONFIG_HOME = path.join(testDir, ".config");

    try {
      const { default: pluginDef } = await import("../index.js");
      const plugin = (pluginDef as { server: Function }).server.bind(pluginDef);
      const mockClient = {
        tool: { ids: vi.fn(async () => ({ data: [] })) },
        mcp: {
          status: vi.fn(async () => ({
            data: { context7: { status: "connected" } },
          })),
        },
      };

      const hooks = await plugin({
        client: mockClient as any,
        project: {} as any,
        directory: testDir,
        worktree: testDir,
        $: {} as any,
        serverUrl: new URL("http://localhost:3000"),
      });

      // Act
      const systemTransform = hooks[
        "experimental.chat.system.transform"
      ] as any;
      const result = await systemTransform(
        { model: { providerID: "test", modelID: "test" } },
        { system: ["Base prompt."] },
      );

      // Assert - rule content should be included when MCP is connected
      expect(result.system.join("\n")).toContain("MCP Context7 rule content");
    } finally {
      process.env.XDG_CONFIG_HOME = originalEnv;
    }
  });
});