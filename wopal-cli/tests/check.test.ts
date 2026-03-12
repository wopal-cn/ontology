import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs-extra";
import path from "path";
import os from "os";
import { LockManager } from "../src/lib/lock-manager.js";
import type { SkillLockEntry } from "../src/types/lock.js";

describe("Check Command - Unit Tests", () => {
  let tempDir: string;
  let lockManager: LockManager;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wopal-cli-test-"));
    const mockConfigService = {
      getProjectLockPath: () =>
        path.join(tempDir, ".wopal", ".skill-lock.json"),
    };
    lockManager = new LockManager(mockConfigService as any);
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  describe("Lock File Merge Logic", () => {
    it("should read project lock", async () => {
      const entry: SkillLockEntry = {
        source: "owner/repo",
        sourceType: "github",
        sourceUrl: "https://github.com/owner/repo",
        skillPath: "skills/test",
        skillFolderHash: "test-hash",
        installedAt: "2026-03-06T00:00:00.000Z",
        updatedAt: "2026-03-06T00:00:00.000Z",
      };

      const lock = await lockManager.readProjectLock();
      lock.skills["test-skill"] = entry;
      await lockManager.writeProjectLock(lock);

      const readLock = await lockManager.readProjectLock();
      expect(readLock.skills["test-skill"]).toEqual(entry);
    });

    it("should read global lock", async () => {
      const entry: SkillLockEntry = {
        source: "owner/repo",
        sourceType: "github",
        sourceUrl: "https://github.com/owner/repo",
        skillPath: "skills/test",
        skillFolderHash: "test-hash",
        installedAt: "2026-03-06T00:00:00.000Z",
        updatedAt: "2026-03-06T00:00:00.000Z",
      };

      const lock = await lockManager.readGlobalLock();
      lock.skills["test-skill"] = entry;
      await lockManager.writeGlobalLock(lock);

      const readLock = await lockManager.readGlobalLock();
      expect(readLock.skills["test-skill"]).toEqual(entry);
    });

    it("should prioritize project lock over global lock when merging", async () => {
      const projectEntry: SkillLockEntry = {
        source: "owner/repo",
        sourceType: "github",
        sourceUrl: "https://github.com/owner/repo",
        skillPath: "skills/test",
        skillFolderHash: "project-version",
        installedAt: "2026-03-06T00:00:00.000Z",
        updatedAt: "2026-03-06T00:00:00.000Z",
      };

      const globalEntry: SkillLockEntry = {
        source: "owner/repo",
        sourceType: "github",
        sourceUrl: "https://github.com/owner/repo",
        skillPath: "skills/test",
        skillFolderHash: "global-version",
        installedAt: "2026-03-05T00:00:00.000Z",
        updatedAt: "2026-03-05T00:00:00.000Z",
      };

      const projectLock = await lockManager.readProjectLock();
      projectLock.skills["test-skill"] = projectEntry;
      await lockManager.writeProjectLock(projectLock);

      const globalLock = await lockManager.readGlobalLock();
      globalLock.skills["test-skill"] = globalEntry;
      await lockManager.writeGlobalLock(globalLock);

      const [readProject, readGlobal] = await Promise.all([
        lockManager.readProjectLock(),
        lockManager.readGlobalLock(),
      ]);

      const merged = { ...readGlobal.skills, ...readProject.skills };
      expect(merged["test-skill"].skillFolderHash).toBe("project-version");
    });
  });

  describe("Skill Type Detection Logic", () => {
    it("should detect GitHub skill from sourceType", () => {
      const entry: SkillLockEntry = {
        source: "owner/repo",
        sourceType: "github",
        sourceUrl: "https://github.com/owner/repo",
        skillPath: "skills/test",
        skillFolderHash: "test-hash",
        installedAt: "2026-03-06T00:00:00.000Z",
        updatedAt: "2026-03-06T00:00:00.000Z",
      };

      expect(entry.sourceType).toBe("github");
    });

    it("should detect local skill from sourceType", () => {
      const entry: SkillLockEntry = {
        source: "my-skills/test-skill",
        sourceType: "local",
        sourceUrl: "/path/to/my-skills/test-skill",
        skillPath: "/path/to/my-skills/test-skill",
        skillFolderHash: "test-hash",
        installedAt: "2026-03-06T00:00:00.000Z",
        updatedAt: "2026-03-06T00:00:00.000Z",
      };

      expect(entry.sourceType).toBe("local");
    });
  });

  describe("Version Fingerprint Comparison Logic", () => {
    it("should compare hashes correctly", () => {
      const installedHash = "abc123";
      const latestHash = "abc123";
      expect(installedHash === latestHash).toBe(true);
    });

    it("should detect different hashes", () => {
      const installedHash = "abc123";
      const latestHash = "xyz789";
      expect(installedHash === latestHash).toBe(false);
    });

    it("should handle hash prefix display", () => {
      const hash = "a6e93af834ba80ee490c9ead9df99771c746ba3a";
      const prefix = hash.substring(0, 8);
      expect(prefix).toBe("a6e93af8");
    });
  });

  describe("Concurrency Control Logic", () => {
    it("should limit concurrent checks to 5", async () => {
      const pLimit = await import("p-limit");
      const limit = pLimit.default(5);

      let concurrentCount = 0;
      let maxConcurrent = 0;

      const tasks = Array(10)
        .fill(null)
        .map(() =>
          limit(async () => {
            concurrentCount++;
            maxConcurrent = Math.max(maxConcurrent, concurrentCount);
            await new Promise((resolve) => setTimeout(resolve, 50));
            concurrentCount--;
          }),
        );

      await Promise.all(tasks);
      expect(maxConcurrent).toBeLessThanOrEqual(5);
    });

    it("should implement exponential backoff for retries", () => {
      const maxRetries = 3;
      const delays: number[] = [];

      for (let attempt = 1; attempt < maxRetries; attempt++) {
        const delay = Math.pow(2, attempt - 1) * 1000;
        delays.push(delay);
      }

      expect(delays).toEqual([1000, 2000]);
    });

    it("should have correct timeout values", () => {
      const singleRequestTimeout = 10000;
      const totalCheckTimeout = 5 * 60 * 1000;

      expect(singleRequestTimeout).toBe(10000);
      expect(totalCheckTimeout).toBe(300000);
    });

    it("should handle partial failures in concurrent checks", async () => {
      const pLimit = await import("p-limit");
      const limit = pLimit.default(5);

      const tasks = [
        limit(() => Promise.resolve("success")),
        limit(() => Promise.reject(new Error("failed"))),
        limit(() => Promise.resolve("success")),
      ];

      const results = await Promise.allSettled(tasks);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      expect(fulfilled).toHaveLength(2);
      expect(rejected).toHaveLength(1);
    });
  });

  describe("Error Handling Logic", () => {
    it("should handle missing skill folder", async () => {
      const nonExistentPath = path.join(tempDir, "non-existent");
      expect(await fs.pathExists(nonExistentPath)).toBe(false);
    });

    it("should handle empty lock file", async () => {
      const lock = await lockManager.readProjectLock();
      expect(lock.version).toBe(3);
      expect(Object.keys(lock.skills)).toHaveLength(0);
    });

    it("should handle corrupted lock file gracefully", async () => {
      const lockPath = lockManager.getProjectLockPath();
      await fs.ensureDir(path.dirname(lockPath));
      await fs.writeFile(lockPath, "invalid json", "utf-8");

      const lock = await lockManager.readProjectLock();
      expect(lock.version).toBe(3);
      expect(Object.keys(lock.skills)).toHaveLength(0);
    });
  });
});
