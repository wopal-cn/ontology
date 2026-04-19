import { describe, it, expect } from "vitest";
import { extractFilePathsFromMessages } from "./index.js";

describe("extractFilePathsFromMessages", () => {
  it("should extract file paths from read tool invocations", () => {
    // Arrange
    const messages = [
      {
        role: "user",
        parts: [
          {
            type: "tool-invocation" as const,
            toolInvocation: {
              toolName: "read",
              args: { filePath: "src/utils.ts" },
            },
          },
        ],
      },
    ];

    // Act
    const paths = extractFilePathsFromMessages(messages);

    // Assert
    expect(paths).toContain("src/utils.ts");
  });

  it("should extract file paths from edit tool invocations", () => {
    // Arrange
    const messages = [
      {
        role: "user",
        parts: [
          {
            type: "tool-invocation" as const,
            toolInvocation: {
              toolName: "edit",
              args: { filePath: "src/components/Button.tsx" },
            },
          },
        ],
      },
    ];

    // Act
    const paths = extractFilePathsFromMessages(messages);

    // Assert
    expect(paths).toContain("src/components/Button.tsx");
  });

  it("should extract file paths from write tool invocations", () => {
    // Arrange
    const messages = [
      {
        role: "user",
        parts: [
          {
            type: "tool-invocation" as const,
            toolInvocation: {
              toolName: "write",
              args: { filePath: "test/data.json" },
            },
          },
        ],
      },
    ];

    // Act
    const paths = extractFilePathsFromMessages(messages);

    // Assert
    expect(paths).toContain("test/data.json");
  });

  it("should extract directory from glob pattern arguments", () => {
    // Arrange
    const messages = [
      {
        role: "user",
        parts: [
          {
            type: "tool-invocation" as const,
            toolInvocation: {
              toolName: "glob",
              args: { pattern: "src/components/**/*.ts" },
            },
          },
        ],
      },
    ];

    // Act
    const paths = extractFilePathsFromMessages(messages);

    // Assert
    expect(paths).toContain("src/components");
  });

  it("should extract directory from glob pattern in path argument", () => {
    // Arrange
    const messages = [
      {
        role: "user",
        parts: [
          {
            type: "tool-invocation" as const,
            toolInvocation: {
              toolName: "glob",
              args: { path: "src/lib" },
            },
          },
        ],
      },
    ];

    // Act
    const paths = extractFilePathsFromMessages(messages);

    // Assert
    expect(paths).toContain("src/lib");
  });

  it("should only extract path argument from grep, not include patterns", () => {
    // Arrange
    const messages = [
      {
        role: "user",
        parts: [
          {
            type: "tool-invocation" as const,
            toolInvocation: {
              toolName: "grep",
              args: { include: "*.ts", path: "src" },
            },
          },
        ],
      },
    ];

    // Act
    const paths = extractFilePathsFromMessages(messages);

    // Assert
    expect(paths).toContain("src");
    // Verify that include pattern '*.ts' is not extracted
    expect(paths).not.toContain("*.ts");
  });

  it("should extract file paths from text content using regex", () => {
    // Arrange
    const messages = [
      {
        role: "user",
        parts: [
          {
            type: "text" as const,
            text: "I modified src/utils/helpers.ts and lib/helpers.js",
          },
        ],
      },
    ];

    // Act
    const paths = extractFilePathsFromMessages(messages);

    // Assert
    expect(paths).toContain("src/utils/helpers.ts");
    expect(paths).toContain("lib/helpers.js");
  });

  it("should extract paths with relative path prefixes", () => {
    // Arrange
    const messages = [
      {
        role: "user",
        parts: [
          {
            type: "text" as const,
            text: "Updated ./src/app.ts and ../config.js",
          },
        ],
      },
    ];

    // Act
    const paths = extractFilePathsFromMessages(messages);

    // Assert
    expect(paths).toContain("./src/app.ts");
    expect(paths).toContain("../config.js");
  });

  it("should extract paths with absolute path prefixes", () => {
    // Arrange
    const messages = [
      {
        role: "user",
        parts: [
          {
            type: "text" as const,
            text: "Check /etc/config and /home/user/project/src/main.ts",
          },
        ],
      },
    ];

    // Act
    const paths = extractFilePathsFromMessages(messages);

    // Assert
    expect(paths).toContain("/etc/config");
    expect(paths).toContain("/home/user/project/src/main.ts");
  });

  it("should filter out URLs from text extraction", () => {
    // Arrange
    const messages = [
      {
        role: "user",
        parts: [
          {
            type: "text" as const,
            text: "Visit https://github.com/user/repo or check src/main.ts",
          },
        ],
      },
    ];

    // Act
    const paths = extractFilePathsFromMessages(messages);

    // Assert
    expect(paths).not.toContainEqual(expect.stringContaining("://"));
    expect(paths).toContain("src/main.ts");
  });

  it("should filter out email addresses from text extraction", () => {
    // Arrange
    const messages = [
      {
        role: "user",
        parts: [
          {
            type: "text" as const,
            text: "Email user@example.com or check src/config/app.ts",
          },
        ],
      },
    ];

    // Act
    const paths = extractFilePathsFromMessages(messages);

    // Assert
    expect(paths).not.toContainEqual(expect.stringContaining("@"));
    expect(paths).toContain("src/config/app.ts");
  });

  it("should deduplicate extracted paths", () => {
    // Arrange
    const messages = [
      {
        role: "user",
        parts: [
          {
            type: "tool-invocation" as const,
            toolInvocation: {
              toolName: "read",
              args: { filePath: "src/utils.ts" },
            },
          },
          {
            type: "text" as const,
            text: "Also see src/utils.ts for more details",
          },
        ],
      },
    ];

    // Act
    const paths = extractFilePathsFromMessages(messages);

    // Assert
    expect(paths).toHaveLength(1);
    expect(paths[0]).toBe("src/utils.ts");
  });

  it("should handle empty messages", () => {
    // Arrange
    const messages: any[] = [];

    // Act
    const paths = extractFilePathsFromMessages(messages);

    // Assert
    expect(paths).toEqual([]);
  });

  it("should handle messages with empty parts", () => {
    // Arrange
    const messages = [
      {
        role: "user",
        parts: [],
      },
    ];

    // Act
    const paths = extractFilePathsFromMessages(messages);

    // Assert
    expect(paths).toEqual([]);
  });

  it("should ignore unknown tool names", () => {
    // Arrange
    const messages = [
      {
        role: "user",
        parts: [
          {
            type: "tool-invocation" as const,
            toolInvocation: {
              toolName: "unknown-tool",
              args: { filePath: "some/file.ts" },
            },
          },
        ],
      },
    ];

    // Act
    const paths = extractFilePathsFromMessages(messages);

    // Assert
    expect(paths).toEqual([]);
  });

  it("should handle multiple messages and parts", () => {
    // Arrange
    const messages = [
      {
        role: "user",
        parts: [
          {
            type: "tool-invocation" as const,
            toolInvocation: {
              toolName: "read",
              args: { filePath: "src/utils.ts" },
            },
          },
          {
            type: "text" as const,
            text: "Checked lib/helpers.js",
          },
        ],
      },
      {
        role: "assistant",
        parts: [
          {
            type: "text" as const,
            text: "Modified src/components/Button.tsx",
          },
        ],
      },
    ];

    // Act
    const paths = extractFilePathsFromMessages(messages);

    // Assert
    expect(paths).toHaveLength(3);
    expect(paths).toContain("src/utils.ts");
    expect(paths).toContain("lib/helpers.js");
    expect(paths).toContain("src/components/Button.tsx");
  });

  it("should handle glob patterns with nested directories", () => {
    // Arrange
    const messages = [
      {
        role: "user",
        parts: [
          {
            type: "tool-invocation" as const,
            toolInvocation: {
              toolName: "glob",
              args: { pattern: "src/deeply/nested/path/**/*.{ts,tsx}" },
            },
          },
        ],
      },
    ];

    // Act
    const paths = extractFilePathsFromMessages(messages);

    // Assert
    expect(paths).toContain("src/deeply/nested/path");
  });

  it("should handle glob patterns with wildcards at different positions", () => {
    // Arrange
    const messages = [
      {
        role: "user",
        parts: [
          {
            type: "tool-invocation" as const,
            toolInvocation: {
              toolName: "glob",
              args: { pattern: "**/*.test.ts" },
            },
          },
        ],
      },
    ];

    // Act
    const paths = extractFilePathsFromMessages(messages);

    // Assert
    // When pattern starts with glob, should not extract anything
    expect(paths).toEqual([]);
  });

  it("should ignore empty string arguments", () => {
    // Arrange
    const messages = [
      {
        role: "user",
        parts: [
          {
            type: "tool-invocation" as const,
            toolInvocation: {
              toolName: "read",
              args: { filePath: "" },
            },
          },
        ],
      },
    ];

    // Act
    const paths = extractFilePathsFromMessages(messages);

    // Assert
    expect(paths).toEqual([]);
  });

  it("should extract paths with various extensions", () => {
    // Arrange
    const messages = [
      {
        role: "user",
        parts: [
          {
            type: "text" as const,
            text: "Edited src/app.ts src/config.json lib/utils.js docs/readme.md",
          },
        ],
      },
    ];

    // Act
    const paths = extractFilePathsFromMessages(messages);

    // Assert
    expect(paths).toContain("src/app.ts");
    expect(paths).toContain("src/config.json");
    expect(paths).toContain("lib/utils.js");
    expect(paths).toContain("docs/readme.md");
  });

  it("should trim trailing periods from extracted paths", () => {
    // Arrange
    const messages = [
      {
        role: "user",
        parts: [
          {
            type: "text" as const,
            text: "Check src/index.ts. It has the implementation.",
          },
        ],
      },
    ];

    // Act
    const paths = extractFilePathsFromMessages(messages);

    // Assert
    expect(paths).toContain("src/index.ts");
    expect(paths).not.toContain("src/index.ts.");
  });

  it("should trim trailing commas from extracted paths", () => {
    // Arrange
    const messages = [
      {
        role: "user",
        parts: [
          {
            type: "text" as const,
            text: "Modified src/utils.ts, lib/helpers.js, and docs/guide.md",
          },
        ],
      },
    ];

    // Act
    const paths = extractFilePathsFromMessages(messages);

    // Assert
    expect(paths).toContain("src/utils.ts");
    expect(paths).toContain("lib/helpers.js");
    expect(paths).toContain("docs/guide.md");
    expect(paths).not.toContain("src/utils.ts,");
  });

  it("should trim multiple trailing punctuation marks from extracted paths", () => {
    // Arrange
    const messages = [
      {
        role: "user",
        parts: [
          {
            type: "text" as const,
            text: "Updated src/app.ts!!! src/config.json?? lib/utils.js:: docs/readme.md;",
          },
        ],
      },
    ];

    // Act
    const paths = extractFilePathsFromMessages(messages);

    // Assert
    expect(paths).toContain("src/app.ts");
    expect(paths).toContain("src/config.json");
    expect(paths).toContain("lib/utils.js");
    expect(paths).toContain("docs/readme.md");
  });

  it("should handle glob patterns without slashes", () => {
    // Arrange
    const messages = [
      {
        role: "user",
        parts: [
          {
            type: "tool-invocation" as const,
            toolInvocation: {
              toolName: "glob",
              args: { pattern: "test*" },
            },
          },
        ],
      },
    ];

    // Act
    const paths = extractFilePathsFromMessages(messages);

    // Assert
    // When pattern has glob characters but no slashes, should not extract file prefix
    expect(paths).toEqual([]);
  });

  it("should extract directory from glob patterns without glob in directory part", () => {
    // Arrange
    const messages = [
      {
        role: "user",
        parts: [
          {
            type: "tool-invocation" as const,
            toolInvocation: {
              toolName: "glob",
              args: { pattern: "src/test*" },
            },
          },
        ],
      },
    ];

    // Act
    const paths = extractFilePathsFromMessages(messages);

    // Assert
    // Pattern has slashes before glob, so should extract the directory
    expect(paths).toContain("src");
  });
});