import { mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { describe, expect, it } from "vitest";
import {
  readMetadata,
  writeMetadata,
  type SkillMetadata,
} from "../src/lib/metadata.js";

describe("metadata utils", () => {
  it("writes and reads metadata with fingerprint fields", async () => {
    const dir = await mkdtemp(join(tmpdir(), "wopal-metadata-"));

    try {
      const metadata: SkillMetadata = {
        name: "demo-skill",
        description: "demo",
        source: "owner/repo@demo-skill",
        sourceUrl: "https://github.com/owner/repo.git",
        skillPath: "skills/demo-skill",
        downloadedAt: "2026-03-07T00:00:00.000Z",
        skillFolderHash: "abc123hash",
        commit: "a".repeat(40),
        ref: "main",
        tag: "v1.0.0",
      };

      await writeMetadata(dir, metadata);
      const loaded = await readMetadata(dir);

      expect(loaded).toEqual(metadata);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("reads old metadata without skillFolderHash", async () => {
    const dir = await mkdtemp(join(tmpdir(), "wopal-metadata-old-"));

    try {
      const oldMetadata = {
        name: "legacy-skill",
        description: "legacy",
        source: "owner/repo@legacy-skill",
        sourceUrl: "https://github.com/owner/repo.git",
        skillPath: "skills/legacy-skill",
        downloadedAt: "2026-03-07T00:00:00.000Z",
      };

      await writeMetadata(dir, oldMetadata as SkillMetadata);
      const loaded = await readMetadata(dir);

      expect(loaded?.name).toBe("legacy-skill");
      expect(loaded?.skillFolderHash).toBeUndefined();
      expect(loaded?.commit).toBeUndefined();
      expect(loaded?.ref).toBeUndefined();
      expect(loaded?.tag).toBeUndefined();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
