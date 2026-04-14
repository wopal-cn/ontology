import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import path from "path";
import os from "os";
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "fs";
import {
  discoverRuleFiles,
  parseRuleMetadata,
  clearRuleCache,
  type DiscoveredRule,
} from "./index.js";

// Test directories - initialized in setupTestDirs
let testDir: string;
let globalRulesDir: string;
let projectRulesDir: string;

/**
 * Helper to convert file paths to DiscoveredRule objects for testing
 */
function toRules(paths: string[]): DiscoveredRule[] {
  return paths.map((filePath) => ({
    filePath,
    relativePath: path.basename(filePath),
  }));
}

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

describe("parseRuleMetadata", () => {
  it("should parse YAML metadata from .mdc files", () => {
    // Arrange
    const content = `---
globs:
  - "src/components/**/*.ts"
---

This is a rule for TypeScript components.`;

    // Act
    const metadata = parseRuleMetadata(content);

    // Assert
    expect(metadata).toBeDefined();
    expect(metadata?.globs).toEqual(["src/components/**/*.ts"]);
  });

  it("should return undefined for files without metadata", () => {
    // Arrange
    const content = "This rule should always apply.";

    // Act
    const metadata = parseRuleMetadata(content);

    // Assert
    expect(metadata).toBeUndefined();
  });

  it("should extract rule content without metadata", () => {
    // Arrange
    const content = `---
globs:
  - "src/**/*.ts"
---

Rule content here`;

    // Act
    const metadata = parseRuleMetadata(content);
    const ruleContent = content.replace(/^---[\s\S]*?---\n/, "");

    // Assert
    expect(metadata?.globs).toBeDefined();
    expect(ruleContent).toBe("\nRule content here");
  });

  it("should handle multiple globs in metadata", () => {
    // Arrange
    const content = `---
globs:
  - "src/**/*.ts"
  - "lib/**/*.js"
---

Rule content`;

    // Act
    const metadata = parseRuleMetadata(content);

    // Assert
    expect(metadata?.globs).toEqual(["src/**/*.ts", "lib/**/*.js"]);
  });

  it("should parse keywords from YAML metadata", () => {
    // Arrange
    const content = `---
keywords:
  - "testing"
  - "unit test"
---

Follow testing best practices.`;

    // Act
    const metadata = parseRuleMetadata(content);

    // Assert
    expect(metadata).toBeDefined();
    expect(metadata?.keywords).toEqual(["testing", "unit test"]);
  });

  it("should parse both globs and keywords from metadata", () => {
    // Arrange
    const content = `---
globs:
  - "**/*.test.ts"
keywords:
  - "testing"
---

Testing rule content.`;

    // Act
    const metadata = parseRuleMetadata(content);

    // Assert
    expect(metadata?.globs).toEqual(["**/*.test.ts"]);
    expect(metadata?.keywords).toEqual(["testing"]);
  });

  it("should handle keywords before globs in YAML", () => {
    // Arrange
    const content = `---
keywords:
  - "refactor"
globs:
  - "src/**/*.ts"
---

Refactoring rules.`;

    // Act
    const metadata = parseRuleMetadata(content);

    // Assert
    expect(metadata?.keywords).toEqual(["refactor"]);
    expect(metadata?.globs).toEqual(["src/**/*.ts"]);
  });

  it("should parse tools from YAML metadata", () => {
    // Arrange
    const content = `---
tools:
  - "mcp_websearch"
  - "mcp_codesearch"
---

Use web search best practices.`;

    // Act
    const metadata = parseRuleMetadata(content);

    // Assert
    expect(metadata).toBeDefined();
    expect(metadata?.tools).toEqual(["mcp_websearch", "mcp_codesearch"]);
  });

  it("should parse tools alongside globs and keywords", () => {
    // Arrange
    const content = `---
globs:
  - "**/*.test.ts"
keywords:
  - "testing"
tools:
  - "mcp_bash"
---

Testing rule with all conditions.`;

    // Act
    const metadata = parseRuleMetadata(content);

    // Assert
    expect(metadata?.globs).toEqual(["**/*.test.ts"]);
    expect(metadata?.keywords).toEqual(["testing"]);
    expect(metadata?.tools).toEqual(["mcp_bash"]);
  });

  it("should handle tools-only metadata", () => {
    // Arrange
    const content = `---
tools:
  - "mcp_lsp"
---

LSP-specific guidelines.`;

    // Act
    const metadata = parseRuleMetadata(content);

    // Assert
    expect(metadata).toBeDefined();
    expect(metadata?.tools).toEqual(["mcp_lsp"]);
    expect(metadata?.globs).toBeUndefined();
    expect(metadata?.keywords).toBeUndefined();
  });
});

describe("discoverRuleFiles", () => {
  beforeEach(() => {
    setupTestDirs();
  });

  afterEach(() => {
    teardownTestDirs();
    vi.resetAllMocks();
  });

  describe("global rules discovery", () => {
    it("should discover markdown files from XDG_CONFIG_HOME/opencode/rules", async () => {
      // Arrange
      writeFileSync(path.join(globalRulesDir, "rule1.md"), "# Rule 1");
      writeFileSync(path.join(globalRulesDir, "rule2.md"), "# Rule 2");

      // Mock XDG_CONFIG_HOME
      const originalEnv = process.env.XDG_CONFIG_HOME;
      process.env.XDG_CONFIG_HOME = path.join(testDir, ".config");

      try {
        // Act
        const files = await discoverRuleFiles();

        // Assert
        expect(
          files.some(
            (f) => f.filePath === path.join(globalRulesDir, "rule1.md"),
          ),
        ).toBe(true);
        expect(
          files.some(
            (f) => f.filePath === path.join(globalRulesDir, "rule2.md"),
          ),
        ).toBe(true);
      } finally {
        process.env.XDG_CONFIG_HOME = originalEnv;
      }
    });

    it("should use ~/.config/opencode/rules as fallback when XDG_CONFIG_HOME not set", async () => {
      // Arrange
      const homeDir = path.join(testDir, "home");
      mkdirSync(homeDir, { recursive: true });
      const fallbackDir = path.join(homeDir, ".config", "opencode", "rules");
      mkdirSync(fallbackDir, { recursive: true });
      writeFileSync(path.join(fallbackDir, "rule.md"), "# Rule");

      // Mock environment
      const originalHome = process.env.HOME;
      const originalXDG = process.env.XDG_CONFIG_HOME;
      process.env.HOME = homeDir;
      delete process.env.XDG_CONFIG_HOME;

      try {
        // Act
        const files = await discoverRuleFiles();

        // Assert
        expect(
          files.some((f) => f.filePath === path.join(fallbackDir, "rule.md")),
        ).toBe(true);
      } finally {
        process.env.HOME = originalHome;
        process.env.XDG_CONFIG_HOME = originalXDG;
      }
    });

    it("should handle missing global rules directory gracefully", async () => {
      // Arrange
      const originalEnv = process.env.XDG_CONFIG_HOME;
      process.env.XDG_CONFIG_HOME = path.join(testDir, ".config");

      try {
        // Remove the directory to test graceful handling
        rmSync(globalRulesDir, { recursive: true, force: true });

        // Act & Assert - should not throw
        const files = await discoverRuleFiles();
        expect(files).toEqual([]);
      } finally {
        process.env.XDG_CONFIG_HOME = originalEnv;
      }
    });

    it("should include both .md and .mdc files", async () => {
      // Arrange
      writeFileSync(path.join(globalRulesDir, "rule.md"), "# Rule");
      writeFileSync(
        path.join(globalRulesDir, "rule.mdc"),
        "# Rule with metadata",
      );
      writeFileSync(path.join(globalRulesDir, "rule.txt"), "Not markdown");
      writeFileSync(path.join(globalRulesDir, "rule.json"), "{}");

      const originalEnv = process.env.XDG_CONFIG_HOME;
      process.env.XDG_CONFIG_HOME = path.join(testDir, ".config");

      try {
        // Act
        const files = await discoverRuleFiles();

        // Assert
        expect(files).toHaveLength(2);
        expect(files.some((f) => f.filePath.endsWith(".md"))).toBe(true);
        expect(files.some((f) => f.filePath.endsWith(".mdc"))).toBe(true);
      } finally {
        process.env.XDG_CONFIG_HOME = originalEnv;
      }
    });

    it("should exclude hidden files", async () => {
      // Arrange
      writeFileSync(path.join(globalRulesDir, "rule.md"), "# Rule");
      writeFileSync(path.join(globalRulesDir, ".hidden.md"), "# Hidden");

      const originalEnv = process.env.XDG_CONFIG_HOME;
      process.env.XDG_CONFIG_HOME = path.join(testDir, ".config");

      try {
        // Act
        const files = await discoverRuleFiles();

        // Assert
        expect(files.every((f) => !f.filePath.includes(".hidden.md"))).toBe(
          true,
        );
      } finally {
        process.env.XDG_CONFIG_HOME = originalEnv;
      }
    });
  });

  describe("project rules discovery", () => {
    it("should discover markdown files from .opencode/rules directory", async () => {
      // Arrange
      const projectDir = path.join(testDir, "project");
      mkdirSync(projectDir, { recursive: true });
      const projRulesDir = path.join(projectDir, ".opencode", "rules");
      mkdirSync(projRulesDir, { recursive: true });
      writeFileSync(path.join(projRulesDir, "local-rule.md"), "# Local Rule");

      // Act
      const files = await discoverRuleFiles(projectDir);

      // Assert
      expect(
        files.some(
          (f) => f.filePath === path.join(projRulesDir, "local-rule.md"),
        ),
      ).toBe(true);
    });

    it("should handle missing .opencode directory gracefully", async () => {
      // Arrange
      const projectDir = path.join(testDir, "empty-project");
      mkdirSync(projectDir, { recursive: true });

      const originalEnv = process.env.XDG_CONFIG_HOME;
      process.env.XDG_CONFIG_HOME = path.join(testDir, ".config");

      try {
        // Act & Assert - should not throw
        const files = await discoverRuleFiles(projectDir);
        // Should return empty since we set XDG_CONFIG_HOME to test dir with no rules
        expect(files).toEqual([]);
      } finally {
        process.env.XDG_CONFIG_HOME = originalEnv;
      }
    });

    it("should discover rules from both global and project directories", async () => {
      // Arrange
      writeFileSync(path.join(globalRulesDir, "global.md"), "# Global");

      const projectDir = path.join(testDir, "project");
      mkdirSync(projectDir, { recursive: true });
      const projRulesDir = path.join(projectDir, ".opencode", "rules");
      mkdirSync(projRulesDir, { recursive: true });
      writeFileSync(path.join(projRulesDir, "local.md"), "# Local");

      const originalEnv = process.env.XDG_CONFIG_HOME;
      process.env.XDG_CONFIG_HOME = path.join(testDir, ".config");

      try {
        // Act
        const files = await discoverRuleFiles(projectDir);

        // Assert
        expect(files).toHaveLength(2);
        expect(files.some((f) => f.filePath.includes("global.md"))).toBe(true);
        expect(files.some((f) => f.filePath.includes("local.md"))).toBe(true);
      } finally {
        process.env.XDG_CONFIG_HOME = originalEnv;
      }
    });
  });

  describe("subdirectory scanning", () => {
    it("should discover rules in nested subdirectories", async () => {
      // Arrange
      const nestedDir = path.join(globalRulesDir, "typescript");
      mkdirSync(nestedDir, { recursive: true });
      writeFileSync(path.join(nestedDir, "react.md"), "# React Rules");

      const originalEnv = process.env.XDG_CONFIG_HOME;
      process.env.XDG_CONFIG_HOME = path.join(testDir, ".config");

      try {
        // Act
        const files = await discoverRuleFiles();

        // Assert
        expect(
          files.some((f) => f.filePath === path.join(nestedDir, "react.md")),
        ).toBe(true);
      } finally {
        process.env.XDG_CONFIG_HOME = originalEnv;
      }
    });

    it("should discover rules in deeply nested subdirectories (multiple levels)", async () => {
      // Arrange
      const deepDir = path.join(
        globalRulesDir,
        "lang",
        "typescript",
        "framework",
      );
      mkdirSync(deepDir, { recursive: true });
      writeFileSync(path.join(deepDir, "nextjs.md"), "# Next.js Rules");

      const originalEnv = process.env.XDG_CONFIG_HOME;
      process.env.XDG_CONFIG_HOME = path.join(testDir, ".config");

      try {
        // Act
        const files = await discoverRuleFiles();

        // Assert
        expect(
          files.some((f) => f.filePath === path.join(deepDir, "nextjs.md")),
        ).toBe(true);
      } finally {
        process.env.XDG_CONFIG_HOME = originalEnv;
      }
    });

    it("should exclude hidden subdirectories", async () => {
      // Arrange
      const hiddenDir = path.join(globalRulesDir, ".hidden");
      mkdirSync(hiddenDir, { recursive: true });
      writeFileSync(path.join(hiddenDir, "secret.md"), "# Secret Rule");
      writeFileSync(path.join(globalRulesDir, "visible.md"), "# Visible Rule");

      const originalEnv = process.env.XDG_CONFIG_HOME;
      process.env.XDG_CONFIG_HOME = path.join(testDir, ".config");

      try {
        // Act
        const files = await discoverRuleFiles();

        // Assert
        expect(files.every((f) => !f.filePath.includes(".hidden"))).toBe(true);
        expect(files.every((f) => !f.filePath.includes("secret.md"))).toBe(
          true,
        );
        expect(
          files.some(
            (f) => f.filePath === path.join(globalRulesDir, "visible.md"),
          ),
        ).toBe(true);
      } finally {
        process.env.XDG_CONFIG_HOME = originalEnv;
      }
    });

    it("should discover rules from mixed flat and nested structures", async () => {
      // Arrange
      writeFileSync(path.join(globalRulesDir, "root.md"), "# Root Rule");
      const nestedDir = path.join(globalRulesDir, "nested");
      mkdirSync(nestedDir, { recursive: true });
      writeFileSync(path.join(nestedDir, "child.md"), "# Child Rule");

      const originalEnv = process.env.XDG_CONFIG_HOME;
      process.env.XDG_CONFIG_HOME = path.join(testDir, ".config");

      try {
        // Act
        const files = await discoverRuleFiles();

        // Assert
        expect(files).toHaveLength(2);
        expect(
          files.some(
            (f) => f.filePath === path.join(globalRulesDir, "root.md"),
          ),
        ).toBe(true);
        expect(
          files.some((f) => f.filePath === path.join(nestedDir, "child.md")),
        ).toBe(true);
      } finally {
        process.env.XDG_CONFIG_HOME = originalEnv;
      }
    });

    it("should discover rules in project subdirectories", async () => {
      // Arrange
      const projectDir = path.join(testDir, "project");
      const projRulesDir = path.join(projectDir, ".opencode", "rules");
      const nestedDir = path.join(projRulesDir, "frontend");
      mkdirSync(nestedDir, { recursive: true });
      writeFileSync(path.join(nestedDir, "react.md"), "# React Rules");

      const originalEnv = process.env.XDG_CONFIG_HOME;
      process.env.XDG_CONFIG_HOME = path.join(testDir, ".config");

      try {
        // Act
        const files = await discoverRuleFiles(projectDir);

        // Assert
        expect(
          files.some((f) => f.filePath === path.join(nestedDir, "react.md")),
        ).toBe(true);
      } finally {
        process.env.XDG_CONFIG_HOME = originalEnv;
      }
    });
  });
});

describe("YAML Parsing Edge Cases", () => {
  beforeEach(() => {
    setupTestDirs();
    clearRuleCache();
  });

  afterEach(() => {
    teardownTestDirs();
  });

  it("should handle empty frontmatter", () => {
    const content = "---\n---\nRule content here";
    const metadata = parseRuleMetadata(content);
    expect(metadata).toBeUndefined();
  });

  it("should handle frontmatter with only whitespace", () => {
    const content = "---\n   \n---\nRule content here";
    const metadata = parseRuleMetadata(content);
    expect(metadata).toBeUndefined();
  });

  it("should handle complex YAML structures", () => {
    const content = `---
globs:
  - "**/*.ts"
  - "**/*.tsx"
keywords:
  - refactoring
  - cleanup
  - code review
---
Rule content`;
    const metadata = parseRuleMetadata(content);
    expect(metadata?.globs).toEqual(["**/*.ts", "**/*.tsx"]);
    expect(metadata?.keywords).toEqual([
      "refactoring",
      "cleanup",
      "code review",
    ]);
  });

  it("should handle inline array syntax in YAML", () => {
    // Note: inline array syntax is valid YAML
    const content = `---
globs: ["**/*.js", "**/*.jsx"]
---
Rule content`;
    const metadata = parseRuleMetadata(content);
    expect(metadata?.globs).toEqual(["**/*.js", "**/*.jsx"]);
  });

  it("should ignore non-string array elements", () => {
    const content = `---
globs:
  - "**/*.ts"
  - 123
  - true
keywords:
  - test
---
Rule content`;
    const metadata = parseRuleMetadata(content);
    // Only string elements should be included
    expect(metadata?.globs).toEqual(["**/*.ts"]);
    expect(metadata?.keywords).toEqual(["test"]);
  });
});

describe("Cache Functionality", () => {
  beforeEach(() => {
    setupTestDirs();
    clearRuleCache();
  });

  afterEach(() => {
    teardownTestDirs();
  });

  it("should use cached content on second read", async () => {
    // Arrange - create a rule file
    const rulePath = path.join(globalRulesDir, "cached-rule.md");
    writeFileSync(rulePath, "# Cached Rule\n\nThis should be cached.");

    // Import readAndFormatRules for cache testing
    const { readAndFormatRules } = await import("./formatter.js");
    const rules = toRules([rulePath]);

    // Act - read the file twice
    const result1 = await readAndFormatRules(rules);
    const result2 = await readAndFormatRules(rules);

    // Assert - both should have the same content
    expect(result1).toContain("Cached Rule");
    expect(result2).toContain("Cached Rule");
    expect(result1).toBe(result2);
  });

  it("should invalidate cache when file is modified", async () => {
    // Arrange - create a rule file
    const rulePath = path.join(globalRulesDir, "mutable-rule.md");
    writeFileSync(rulePath, "# Original Content");

    const { readAndFormatRules } = await import("./formatter.js");
    const rules = toRules([rulePath]);

    // Act - read the file
    const result1 = await readAndFormatRules(rules);
    expect(result1).toContain("Original Content");

    // Wait a bit to ensure mtime changes
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Modify the file
    writeFileSync(rulePath, "# Modified Content");

    // Read again
    const result2 = await readAndFormatRules(rules);

    // Assert - should get the new content
    expect(result2).toContain("Modified Content");
    expect(result2).not.toContain("Original Content");
  });

  it("should handle clearRuleCache correctly", async () => {
    // Arrange - create a rule file
    const rulePath = path.join(globalRulesDir, "clear-test.md");
    writeFileSync(rulePath, "# Test Content");

    const { readAndFormatRules } = await import("./formatter.js");
    const rules = toRules([rulePath]);

    // Act - read, clear cache, read again
    await readAndFormatRules(rules);
    clearRuleCache();

    // File should be re-read from disk (we can verify by checking the result is still correct)
    const result = await readAndFormatRules(rules);
    expect(result).toContain("Test Content");
  });
});