import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { execSyncMock } = vi.hoisted(() => ({
  execSyncMock: vi.fn(),
}));

vi.mock("child_process", () => ({
  execSync: execSyncMock,
}));

import { fetchSkillFolderHash, getGitHubToken } from "../src/lib/skill-lock.js";

describe("skill-lock utils", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
  });

  it("prefers GITHUB_TOKEN over GH_TOKEN and gh auth token", () => {
    process.env.GITHUB_TOKEN = "github-token";
    process.env.GH_TOKEN = "gh-token";

    const token = getGitHubToken();

    expect(token).toBe("github-token");
    expect(execSyncMock).not.toHaveBeenCalled();
  });

  it("uses GH_TOKEN when GITHUB_TOKEN is absent", () => {
    delete process.env.GITHUB_TOKEN;
    process.env.GH_TOKEN = "gh-token";

    const token = getGitHubToken();

    expect(token).toBe("gh-token");
    expect(execSyncMock).not.toHaveBeenCalled();
  });

  it("falls back to gh auth token command", () => {
    delete process.env.GITHUB_TOKEN;
    delete process.env.GH_TOKEN;
    execSyncMock.mockReturnValue("cli-token\n");

    const token = getGitHubToken();

    expect(token).toBe("cli-token");
    expect(execSyncMock).toHaveBeenCalledWith("gh auth token", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
  });

  it("fetches folder tree SHA for existing skill path", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        sha: "root-sha",
        tree: [
          { path: "skills/my-skill", type: "tree", sha: "folder-sha-123" },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const hash = await fetchSkillFolderHash(
      "owner/repo",
      "/skills/my-skill/SKILL.md",
      "token-1",
    );

    expect(hash).toBe("folder-sha-123");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.github.com/repos/owner/repo/git/trees/main?recursive=1",
      expect.objectContaining({
        headers: {
          Accept: "application/vnd.github.v3+json",
          Authorization: "Bearer token-1",
          "User-Agent": "wopal-cli",
        },
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("returns null when skill folder does not exist in tree", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => ({ sha: "r1", tree: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sha: "r0", tree: [] }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const hash = await fetchSkillFolderHash(
      "owner/repo",
      "skills/not-found/SKILL.md",
    );

    expect(hash).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("falls back from main to master branch", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          sha: "root-master",
          tree: [{ path: "skills/s1", type: "tree", sha: "master-folder-sha" }],
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const hash = await fetchSkillFolderHash("owner/repo", "skills/s1/SKILL.md");

    expect(hash).toBe("master-folder-sha");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
