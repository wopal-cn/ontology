import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs-extra";
import path from "path";
import os from "os";
import { LockManager } from "../src/lib/lock-manager.js";
import type { SkillLockEntry } from "../src/types/lock.js";

describe("LockManager", () => {
  let tempDir: string;
  let lockManager: LockManager;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wopal-cli-test-"));
    const mockConfigService = {
      getProjectLockPath: () => path.join(tempDir, ".wopal", ".skill-lock.json"),
    };
    lockManager = new LockManager(mockConfigService as any);
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it("should create empty lock file when not exists", async () => {
    const lock = await lockManager.readProjectLock();

    expect(lock.version).toBe(3);
    expect(lock.skills).toEqual({});
  });

  it("should write and read project lock file", async () => {
    const entry: SkillLockEntry = {
      source: "owner/repo",
      sourceType: "github",
      sourceUrl: "https://github.com/owner/repo",
      skillPath: "skills/test",
      skillFolderHash: "abc123",
      installedAt: "2026-03-06T00:00:00.000Z",
      updatedAt: "2026-03-06T00:00:00.000Z",
    };

    const lock = await lockManager.readProjectLock();
    lock.skills["test-skill"] = entry;
    await lockManager.writeProjectLock(lock);

    const readLock = await lockManager.readProjectLock();
    expect(readLock.skills["test-skill"]).toEqual(entry);
  });

  it("should sort skills alphabetically in project lock", async () => {
    const entry1: SkillLockEntry = {
      source: "owner/repo",
      sourceType: "github",
      sourceUrl: "https://github.com/owner/repo",
      skillPath: "skills/z-skill",
      skillFolderHash: "hash1",
      installedAt: "2026-03-06T00:00:00.000Z",
      updatedAt: "2026-03-06T00:00:00.000Z",
    };

    const entry2: SkillLockEntry = {
      source: "owner/repo",
      sourceType: "github",
      sourceUrl: "https://github.com/owner/repo",
      skillPath: "skills/a-skill",
      skillFolderHash: "hash2",
      installedAt: "2026-03-06T00:00:00.000Z",
      updatedAt: "2026-03-06T00:00:00.000Z",
    };

    const lock = await lockManager.readProjectLock();
    lock.skills["z-skill"] = entry1;
    lock.skills["a-skill"] = entry2;
    await lockManager.writeProjectLock(lock);

    const readLock = await lockManager.readProjectLock();
    const skillNames = Object.keys(readLock.skills);
    expect(skillNames).toEqual(["a-skill", "z-skill"]);
  });

  it("should return empty lock for version < 3", async () => {
    const lockPath = lockManager.getProjectLockPath();
    await fs.ensureDir(path.dirname(lockPath));
    await fs.writeJson(lockPath, { version: 1, skills: {} });

    const lock = await lockManager.readProjectLock();
    expect(lock.version).toBe(3);
    expect(lock.skills).toEqual({});
  });

  it("should add skill to both locks", async () => {
    const entry: SkillLockEntry = {
      source: "owner/repo",
      sourceType: "github",
      sourceUrl: "https://github.com/owner/repo",
      skillPath: "skills/test",
      skillFolderHash: "abc123",
      installedAt: "2026-03-06T00:00:00.000Z",
      updatedAt: "2026-03-06T00:00:00.000Z",
    };

    await lockManager.addSkillToBothLocks("test-skill", entry);

    const projectLock = await lockManager.readProjectLock();
    const globalLock = await lockManager.readGlobalLock();

    expect(projectLock.skills["test-skill"]).toBeDefined();
    expect(globalLock.skills["test-skill"]).toBeDefined();
    expect(projectLock.skills["test-skill"].source).toBe("owner/repo");
    expect(globalLock.skills["test-skill"].source).toBe("owner/repo");
  });
});
