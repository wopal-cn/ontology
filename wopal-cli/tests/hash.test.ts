import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs-extra";
import path from "path";
import os from "os";
import { computeSkillFolderHash } from "../src/lib/hash.js";

describe("computeSkillFolderHash", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "skill-hash-test-"));
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it("should compute hash for a simple skill", async () => {
    await fs.writeJson(path.join(tempDir, "SKILL.md"), { name: "test-skill" });
    await fs.writeJson(path.join(tempDir, "package.json"), { name: "test" });

    const hash = await computeSkillFolderHash(tempDir);

    expect(hash).toBeDefined();
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("should return same hash for same content", async () => {
    await fs.writeJson(path.join(tempDir, "SKILL.md"), { name: "test-skill" });

    const hash1 = await computeSkillFolderHash(tempDir);
    const hash2 = await computeSkillFolderHash(tempDir);

    expect(hash1).toBe(hash2);
  });

  it("should return different hash for different content", async () => {
    await fs.writeJson(path.join(tempDir, "SKILL.md"), {
      name: "test-skill-v1",
    });
    const hash1 = await computeSkillFolderHash(tempDir);

    await fs.writeJson(path.join(tempDir, "SKILL.md"), {
      name: "test-skill-v2",
    });
    const hash2 = await computeSkillFolderHash(tempDir);

    expect(hash1).not.toBe(hash2);
  });

  it("should exclude .git directory", async () => {
    await fs.writeJson(path.join(tempDir, "SKILL.md"), { name: "test-skill" });
    await fs.ensureDir(path.join(tempDir, ".git"));
    await fs.writeJson(path.join(tempDir, ".git", "config"), { test: "data" });

    const hash = await computeSkillFolderHash(tempDir);

    expect(hash).toBeDefined();
    expect(hash).toHaveLength(64);
  });

  it("should exclude node_modules directory", async () => {
    await fs.writeJson(path.join(tempDir, "SKILL.md"), { name: "test-skill" });
    await fs.ensureDir(path.join(tempDir, "node_modules"));
    await fs.writeJson(path.join(tempDir, "node_modules", "package.json"), {
      name: "dep",
    });

    const hash = await computeSkillFolderHash(tempDir);

    expect(hash).toBeDefined();
    expect(hash).toHaveLength(64);
  });

  it("should handle nested directories", async () => {
    await fs.writeJson(path.join(tempDir, "SKILL.md"), { name: "test-skill" });
    await fs.ensureDir(path.join(tempDir, "scripts"));
    await fs.writeJson(path.join(tempDir, "scripts", "test.js"), {
      script: true,
    });

    const hash = await computeSkillFolderHash(tempDir);

    expect(hash).toBeDefined();
    expect(hash).toHaveLength(64);
  });

  it("should throw error for non-existent path", async () => {
    await expect(
      computeSkillFolderHash("/non/existent/path"),
    ).rejects.toThrow();
  });
});
