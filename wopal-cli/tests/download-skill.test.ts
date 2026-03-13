import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ProgramContext } from "../src/program/types.js";
import { downloadSkillToInbox } from "../src/lib/download-skill.js";
import { GitCloneError } from "../src/lib/git.js";

const {
  cloneRepoMock,
  downloadViaGitHubApiMock,
  parseGitHubUrlMock,
  cleanupTempDirMock,
} = vi.hoisted(() => ({
  cloneRepoMock: vi.fn(),
  downloadViaGitHubApiMock: vi.fn(),
  parseGitHubUrlMock: vi.fn(),
  cleanupTempDirMock: vi.fn(),
}));

vi.mock("../src/lib/git.js", async () => {
  const actual =
    await vi.importActual<typeof import("../src/lib/git.js")>(
      "../src/lib/git.js",
    );
  return {
    ...actual,
    cloneRepo: cloneRepoMock,
    cleanupTempDir: cleanupTempDirMock,
    downloadViaGitHubApi: downloadViaGitHubApiMock,
    parseGitHubUrl: parseGitHubUrlMock,
  };
});

function createContext(): ProgramContext {
  return {
    version: "test",
    debug: false,
    config: {} as ProgramContext["config"],
    output: { print: vi.fn() } as unknown as ProgramContext["output"],
  };
}

describe("download-skill", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns combined API and clone errors instead of masking clone error", async () => {
    downloadViaGitHubApiMock.mockRejectedValue(
      new Error("Failed to get commit info: 404"),
    );

    cloneRepoMock
      .mockRejectedValueOnce(
        new GitCloneError(
          "Authentication failed for https://github.com/cygnusfear/agent-skills.git",
          "https://github.com/cygnusfear/agent-skills.git",
          false,
          true,
        ),
      )
      .mockRejectedValueOnce(
        new GitCloneError(
          "Permission denied (publickey)",
          "git@github.com:cygnusfear/agent-skills.git",
          false,
          true,
        ),
      );

    parseGitHubUrlMock.mockReturnValue({
      owner: "cygnusfear",
      repo: "agent-skills",
    });

    const result = await downloadSkillToInbox(
      "cygnusfear",
      "agent-skills",
      "using-superpowers",
      "/tmp/inbox",
      { force: true },
      createContext(),
    );

    expect(result.success).toEqual([]);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]?.error).toContain(
      "GitHub API failed: Failed to get commit info: 404",
    );
    expect(result.failed[0]?.error).toContain("Git clone failed:");
    expect(result.failed[0]?.error).toContain("Provide GITHUB_TOKEN/GH_TOKEN");
    expect(cloneRepoMock).toHaveBeenCalledTimes(2);
  });
});
