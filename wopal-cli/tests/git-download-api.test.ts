import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanupTempDir, downloadViaGitHubApi } from "../src/lib/git.js";

describe("downloadViaGitHubApi", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses repository default branch when ref is not provided", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ default_branch: "develop" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sha: "sha-develop-1" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            name: "SKILL.md",
            path: "skills/demo/SKILL.md",
            type: "file",
            download_url: "https://example.com/SKILL.md",
          },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => "# Demo Skill",
      });

    vi.stubGlobal("fetch", fetchMock);

    const result = await downloadViaGitHubApi(
      "owner",
      "repo",
      "skills/demo",
      undefined,
    );

    expect(result.commitSha).toBe("sha-develop-1");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.github.com/repos/owner/repo",
      expect.objectContaining({ headers: expect.any(Object) }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.github.com/repos/owner/repo/commits/develop",
      expect.objectContaining({ headers: expect.any(Object) }),
    );

    await cleanupTempDir(result.tempDir);
  });
});
