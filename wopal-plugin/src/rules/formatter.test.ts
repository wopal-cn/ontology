import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "path";
import os from "os";
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "fs";
import { readAndFormatRules, type DiscoveredRule } from "./index.js";

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

describe("readAndFormatRules", () => {
  beforeEach(() => {
    setupTestDirs();
  });

  afterEach(() => {
    teardownTestDirs();
  });

  it("should read and format rule files into a formatted string", async () => {
    // Arrange
    const rule1Path = path.join(globalRulesDir, "rule1.md");
    const rule2Path = path.join(globalRulesDir, "rule2.md");
    writeFileSync(rule1Path, "# Rule 1\nContent of rule 1");
    writeFileSync(rule2Path, "# Rule 2\nContent of rule 2");

    const files = toRules([rule1Path, rule2Path]);

    // Act
    const formatted = await readAndFormatRules(files);

    // Assert
    expect(formatted).toContain("OpenCode Rules");
    expect(formatted).toContain("rule1.md");
    expect(formatted).toContain("rule2.md");
    expect(formatted).toContain("Rule 1");
    expect(formatted).toContain("Rule 2");
  });

  it("should return empty string when no files provided", async () => {
    // Act
    const formatted = await readAndFormatRules([]);

    // Assert
    expect(formatted).toBe("");
  });

  it("should handle file read errors gracefully", async () => {
    // Arrange
    const nonExistentFile = path.join(globalRulesDir, "nonexistent.md");
    const validFile = path.join(globalRulesDir, "valid.md");
    writeFileSync(validFile, "# Valid Rule");

    // Act & Assert - should not throw
    const formatted = await readAndFormatRules(
      toRules([nonExistentFile, validFile]),
    );

    // Should still include the valid file
    expect(formatted).toContain("valid.md");
  });

  it("should include filename as subheader in output", async () => {
    // Arrange
    const rulePath = path.join(globalRulesDir, "my-rules.md");
    writeFileSync(rulePath, "Rule content");

    // Act
    const formatted = await readAndFormatRules(toRules([rulePath]));

    // Assert
    expect(formatted).toMatch(/##\s+my-rules\.md/);
  });

  it("should include instructions to follow rules", async () => {
    // Arrange
    const rulePath = path.join(globalRulesDir, "rule.md");
    writeFileSync(rulePath, "Rule content");

    // Act
    const formatted = await readAndFormatRules(toRules([rulePath]));

    // Assert - check for language indicating rules should be followed
    expect(formatted.toLowerCase()).toMatch(
      /follow|adhereread the following rules|must follow/i,
    );
  });

  it("should apply rules without metadata unconditionally", async () => {
    // Arrange
    const rulePath = path.join(globalRulesDir, "unconditional.mdc");
    writeFileSync(rulePath, "This rule always applies");

    // Act
    const formatted = await readAndFormatRules(toRules([rulePath]), [
      "src/utils/helpers.js",
    ]);

    // Assert - rule should be included even though file doesn't match any pattern
    expect(formatted).toContain("unconditional.mdc");
    expect(formatted).toContain("This rule always applies");
  });

  it("should include rule when file matches glob pattern in metadata", async () => {
    // Arrange
    const rulePath = path.join(globalRulesDir, "typescript.mdc");
    const ruleContent = `---
globs:
  - "src/components/**/*.ts"
---

This is a rule for TypeScript components.`;
    writeFileSync(rulePath, ruleContent);

    // Act - testing with a matching file path
    const formatted = await readAndFormatRules(toRules([rulePath]), [
      "src/components/button.ts",
    ]);

    // Assert
    expect(formatted).toContain("typescript.mdc");
    expect(formatted).toContain("This is a rule for TypeScript components.");
  });

  it("should exclude rule when file does not match glob pattern in metadata", async () => {
    // Arrange
    const rulePath = path.join(globalRulesDir, "typescript.mdc");
    const ruleContent = `---
globs:
  - "src/components/**/*.ts"
---

This is a rule for TypeScript components.`;
    writeFileSync(rulePath, ruleContent);

    // Act - testing with a non-matching file path
    const formatted = await readAndFormatRules(toRules([rulePath]), [
      "src/utils/helpers.js",
    ]);

    // Assert - should return empty because rule doesn't apply
    expect(formatted).toBe("");
  });

  it("should include rule when file matches any of multiple glob patterns", async () => {
    // Arrange
    const rulePath = path.join(globalRulesDir, "multi.mdc");
    const ruleContent = `---
globs:
  - "src/components/**/*.ts"
  - "lib/**/*.js"
---

Multi-pattern rule`;
    writeFileSync(rulePath, ruleContent);

    // Act - test with file matching second pattern
    const formatted = await readAndFormatRules(toRules([rulePath]), [
      "lib/utils/helper.js",
    ]);

    // Assert
    expect(formatted).toContain("multi.mdc");
    expect(formatted).toContain("Multi-pattern rule");
  });

  it("should handle mixed rules with and without metadata", async () => {
    // Arrange
    const unconditionalPath = path.join(globalRulesDir, "always.md");
    const conditionalPath = path.join(globalRulesDir, "conditional.mdc");

    writeFileSync(unconditionalPath, "Always apply this");
    writeFileSync(
      conditionalPath,
      `---
globs:
  - "src/**/*.ts"
---

Only for TypeScript`,
    );

    // Act - test with matching TypeScript file
    const formatted = await readAndFormatRules(
      toRules([unconditionalPath, conditionalPath]),
      ["src/app.ts"],
    );

    // Assert - both should be included
    expect(formatted).toContain("always.md");
    expect(formatted).toContain("Always apply this");
    expect(formatted).toContain("conditional.mdc");
    expect(formatted).toContain("Only for TypeScript");
  });

  it("should exclude conditional rule but include unconditional when file does not match", async () => {
    // Arrange
    const unconditionalPath = path.join(globalRulesDir, "always.md");
    const conditionalPath = path.join(globalRulesDir, "conditional.mdc");

    writeFileSync(unconditionalPath, "Always apply this");
    writeFileSync(
      conditionalPath,
      `---
globs:
  - "src/**/*.ts"
---

Only for TypeScript`,
    );

    // Act - test with non-matching file
    const formatted = await readAndFormatRules(
      toRules([unconditionalPath, conditionalPath]),
      ["docs/readme.md"],
    );

    // Assert - only unconditional rule should be included
    expect(formatted).toContain("always.md");
    expect(formatted).toContain("Always apply this");
    expect(formatted).not.toContain("Only for TypeScript");
  });

  it("should skip conditional rule when no context is provided", async () => {
    // Arrange
    const rulePath = path.join(globalRulesDir, "conditional.mdc");
    writeFileSync(
      rulePath,
      `---
globs:
  - "src/**/*.ts"
---

TypeScript only rule`,
    );

    // Act - no file path provided
    const formatted = await readAndFormatRules(toRules([rulePath]));

    // Assert - rule should NOT be applied (conditions not satisfied)
    expect(formatted).toBe("");
  });

  it("should include rule when user prompt matches keywords", async () => {
    // Arrange
    const rulePath = path.join(globalRulesDir, "testing-rule.mdc");
    writeFileSync(
      rulePath,
      `---
keywords:
  - "testing"
  - "jest"
---

Follow testing best practices.`,
    );

    // Act - prompt matches keyword
    const formatted = await readAndFormatRules(
      toRules([rulePath]),
      [],
      "I need help testing this function",
    );

    // Assert
    expect(formatted).toContain("testing-rule.mdc");
    expect(formatted).toContain("Follow testing best practices");
  });

  it("should exclude rule when user prompt does not match keywords", async () => {
    // Arrange
    const rulePath = path.join(globalRulesDir, "testing-rule.mdc");
    writeFileSync(
      rulePath,
      `---
keywords:
  - "testing"
  - "jest"
---

Follow testing best practices.`,
    );

    // Act - prompt does not match
    const formatted = await readAndFormatRules(
      toRules([rulePath]),
      [],
      "help me with the database",
    );

    // Assert
    expect(formatted).toBe("");
  });

  it("should include rule when either keywords OR globs match (keywords match)", async () => {
    // Arrange
    const rulePath = path.join(globalRulesDir, "test-rule.mdc");
    writeFileSync(
      rulePath,
      `---
globs:
  - "**/*.test.ts"
keywords:
  - "testing"
---

Testing standards.`,
    );

    // Act - keywords match but no test files in context
    const formatted = await readAndFormatRules(
      toRules([rulePath]),
      ["src/app.ts"],
      "help with testing",
    );

    // Assert - rule should be included (keywords matched)
    expect(formatted).toContain("test-rule.mdc");
    expect(formatted).toContain("Testing standards");
  });

  it("should include rule when either keywords OR globs match (globs match)", async () => {
    // Arrange
    const rulePath = path.join(globalRulesDir, "test-rule.mdc");
    writeFileSync(
      rulePath,
      `---
globs:
  - "**/*.test.ts"
keywords:
  - "testing"
---

Testing standards.`,
    );

    // Act - globs match but prompt doesn't mention testing
    const formatted = await readAndFormatRules(
      toRules([rulePath]),
      ["src/utils.test.ts"],
      "fix the import error",
    );

    // Assert - rule should be included (globs matched)
    expect(formatted).toContain("test-rule.mdc");
    expect(formatted).toContain("Testing standards");
  });

  it("should exclude rule when neither keywords nor globs match", async () => {
    // Arrange
    const rulePath = path.join(globalRulesDir, "test-rule.mdc");
    writeFileSync(
      rulePath,
      `---
globs:
  - "**/*.test.ts"
keywords:
  - "testing"
---

Testing standards.`,
    );

    // Act - neither matches
    const formatted = await readAndFormatRules(
      toRules([rulePath]),
      ["src/app.ts"],
      "update the readme",
    );

    // Assert - rule should NOT be included
    expect(formatted).toBe("");
  });

  it("should handle case-insensitive keyword matching", async () => {
    // Arrange
    const rulePath = path.join(globalRulesDir, "case-rule.mdc");
    writeFileSync(
      rulePath,
      `---
keywords:
  - "Testing"
---

Testing rule.`,
    );

    // Act - lowercase in prompt
    const formatted = await readAndFormatRules(
      toRules([rulePath]),
      [],
      "testing in lowercase",
    );

    // Assert
    expect(formatted).toContain("case-rule.mdc");
  });

  it("should match keyword at word boundary (prefix matching)", async () => {
    // Arrange
    const rulePath = path.join(globalRulesDir, "boundary-rule.mdc");
    writeFileSync(
      rulePath,
      `---
keywords:
  - "test"
---

Test rule.`,
    );

    // Act - "test" should match "testing"
    const formatted = await readAndFormatRules(
      toRules([rulePath]),
      [],
      "I am testing this",
    );

    // Assert
    expect(formatted).toContain("boundary-rule.mdc");
  });

  it("should not match keyword mid-word", async () => {
    // Arrange
    const rulePath = path.join(globalRulesDir, "midword-rule.mdc");
    writeFileSync(
      rulePath,
      `---
keywords:
  - "test"
---

Test rule.`,
    );

    // Act - "test" should NOT match "contest"
    const formatted = await readAndFormatRules(
      toRules([rulePath]),
      [],
      "I entered a contest",
    );

    // Assert
    expect(formatted).toBe("");
  });

  it("should include rule when tool is available", async () => {
    // Arrange
    const rulePath = path.join(globalRulesDir, "websearch-rule.mdc");
    writeFileSync(
      rulePath,
      `---
tools:
  - "mcp_websearch"
---

Use web search best practices.`,
    );

    // Act - tool is available
    const formatted = await readAndFormatRules(
      toRules([rulePath]),
      [],
      undefined,
      ["mcp_bash", "mcp_websearch", "mcp_read"],
    );

    // Assert
    expect(formatted).toContain("websearch-rule.mdc");
    expect(formatted).toContain("Use web search best practices");
  });

  it("should exclude rule when tool is not available", async () => {
    // Arrange
    const rulePath = path.join(globalRulesDir, "websearch-rule.mdc");
    writeFileSync(
      rulePath,
      `---
tools:
  - "mcp_websearch"
---

Use web search best practices.`,
    );

    // Act - tool is NOT available
    const formatted = await readAndFormatRules(
      toRules([rulePath]),
      [],
      undefined,
      ["mcp_bash", "mcp_read"],
    );

    // Assert
    expect(formatted).toBe("");
  });

  it("should include rule when any of multiple tools is available (OR logic)", async () => {
    // Arrange
    const rulePath = path.join(globalRulesDir, "search-rule.mdc");
    writeFileSync(
      rulePath,
      `---
tools:
  - "mcp_websearch"
  - "mcp_codesearch"
---

Search best practices.`,
    );

    // Act - only codesearch is available
    const formatted = await readAndFormatRules(
      toRules([rulePath]),
      [],
      undefined,
      ["mcp_bash", "mcp_codesearch"],
    );

    // Assert
    expect(formatted).toContain("search-rule.mdc");
  });

  it("should include rule when tools match OR globs match", async () => {
    // Arrange
    const rulePath = path.join(globalRulesDir, "multi-condition.mdc");
    writeFileSync(
      rulePath,
      `---
tools:
  - "mcp_lsp"
globs:
  - "**/*.ts"
---

TypeScript or LSP rule.`,
    );

    // Act - globs match but tools don't
    const formatted = await readAndFormatRules(
      toRules([rulePath]),
      ["src/index.ts"],
      undefined,
      ["mcp_bash"],
    );

    // Assert - should be included (globs matched)
    expect(formatted).toContain("multi-condition.mdc");
  });

  it("should include rule when tools match OR keywords match", async () => {
    // Arrange
    const rulePath = path.join(globalRulesDir, "tools-keywords.mdc");
    writeFileSync(
      rulePath,
      `---
tools:
  - "mcp_websearch"
keywords:
  - "search"
---

Search guidelines.`,
    );

    // Act - tools match but keywords don't
    const formatted = await readAndFormatRules(
      toRules([rulePath]),
      [],
      "help with database",
      ["mcp_websearch"],
    );

    // Assert - should be included (tools matched)
    expect(formatted).toContain("tools-keywords.mdc");
  });

  it("should exclude rule when neither tools nor globs nor keywords match", async () => {
    // Arrange
    const rulePath = path.join(globalRulesDir, "all-conditions.mdc");
    writeFileSync(
      rulePath,
      `---
tools:
  - "mcp_lsp"
globs:
  - "**/*.ts"
keywords:
  - "typescript"
---

TypeScript with LSP rule.`,
    );

    // Act - nothing matches
    const formatted = await readAndFormatRules(
      toRules([rulePath]),
      ["src/index.js"],
      "help with python",
      ["mcp_bash"],
    );

    // Assert
    expect(formatted).toBe("");
  });

  it("should skip tool-conditional rule when no tools are provided", async () => {
    // Arrange
    const rulePath = path.join(globalRulesDir, "tool-only.mdc");
    writeFileSync(
      rulePath,
      `---
tools:
  - "mcp_websearch"
---

Web search only.`,
    );

    // Act - no tools provided (simulates tool discovery failure)
    const formatted = await readAndFormatRules(toRules([rulePath]));

    // Assert
    expect(formatted).toBe("");
  });

  it("should include unconditional rules even when tool-conditional rules are skipped", async () => {
    // Arrange
    const unconditionalPath = path.join(globalRulesDir, "always.md");
    const conditionalPath = path.join(globalRulesDir, "tool-specific.mdc");

    writeFileSync(unconditionalPath, "Always apply this");
    writeFileSync(
      conditionalPath,
      `---
tools:
  - "mcp_websearch"
---

Only with websearch.`,
    );

    // Act - websearch not available
    const formatted = await readAndFormatRules(
      toRules([unconditionalPath, conditionalPath]),
      [],
      undefined,
      ["mcp_bash"],
    );

    // Assert - only unconditional rule included
    expect(formatted).toContain("always.md");
    expect(formatted).toContain("Always apply this");
    expect(formatted).not.toContain("Only with websearch");
  });
});