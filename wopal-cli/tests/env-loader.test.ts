import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs-extra";
import path from "path";
import os from "os";
import { loadEnv } from "../src/lib/env-loader.js";
import { homedir } from "os";

describe("env-loader", () => {
  const originalEnv = { ...process.env };
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wopal-env-test-"));
  });

  afterEach(async () => {
    process.env = { ...originalEnv };
    await fs.remove(tempDir);
  });

  describe("loadEnv", () => {
    it("should not throw when .env files don't exist", () => {
      expect(() => loadEnv(false, undefined)).not.toThrow();
    });

    it("should handle debug mode without errors", () => {
      expect(() => loadEnv(true, undefined)).not.toThrow();
    });

    it("should expand ~ in environment variables", () => {
      process.env.TEST_PATH = "~/test/path";
      loadEnv(false, undefined);
      expect(process.env.TEST_PATH).toContain(homedir());
      expect(process.env.TEST_PATH).not.toContain("~");
      delete process.env.TEST_PATH;
    });

    it("should load global .env from WOPAL_HOME", async () => {
      const wopalHome = path.join(tempDir, ".wopal");
      await fs.ensureDir(wopalHome);
      await fs.writeFile(
        path.join(wopalHome, ".env"),
        "WOPAL_TEST_GLOBAL_VAR=global-value",
      );

      process.env.WOPAL_HOME = wopalHome;
      delete process.env.WOPAL_TEST_GLOBAL_VAR;

      loadEnv(false, undefined);

      expect(process.env.WOPAL_TEST_GLOBAL_VAR).toBe("global-value");
    });

    it("should load space .env and override global", async () => {
      const wopalHome = path.join(tempDir, ".wopal");
      const spaceDir = path.join(tempDir, "space-a");

      await fs.ensureDir(wopalHome);
      await fs.ensureDir(spaceDir);

      await fs.writeFile(
        path.join(wopalHome, ".env"),
        "WOPAL_TEST_SKILLS_DIR=/default/skills",
      );
      await fs.writeFile(
        path.join(spaceDir, ".env"),
        "WOPAL_TEST_SKILLS_DIR=/space-a/skills",
      );

      process.env.WOPAL_HOME = wopalHome;
      delete process.env.WOPAL_TEST_SKILLS_DIR;

      loadEnv(false, spaceDir);

      // space 级 .env 应该覆盖全局（override: true）
      expect(process.env.WOPAL_TEST_SKILLS_DIR).toBe("/space-a/skills");
    });

    it("should NOT load process.cwd() .env (no cwd fallback)", async () => {
      const wopalHome = path.join(tempDir, ".wopal");
      const spaceDir = path.join(tempDir, "space-a");
      const cwdDir = path.join(tempDir, "cwd");

      await fs.ensureDir(wopalHome);
      await fs.ensureDir(spaceDir);
      await fs.ensureDir(cwdDir);

      await fs.writeFile(
        path.join(wopalHome, ".env"),
        "WOPAL_TEST_CWD_CHECK=/global",
      );
      await fs.writeFile(
        path.join(spaceDir, ".env"),
        "WOPAL_TEST_CWD_CHECK=/space",
      );
      // cwd 目录的 .env（不应被加载）
      await fs.writeFile(
        path.join(cwdDir, ".env"),
        "WOPAL_TEST_CWD_CHECK=/cwd-should-not-load",
      );

      process.env.WOPAL_HOME = wopalHome;
      delete process.env.WOPAL_TEST_CWD_CHECK;

      // 指定 space-a 作为目标空间，即便 cwd 是 cwdDir，也不应加载 cwdDir/.env
      loadEnv(false, spaceDir);

      expect(process.env.WOPAL_TEST_CWD_CHECK).toBe("/space");
    });

    it("should only load global .env when targetSpacePath is undefined", async () => {
      const wopalHome = path.join(tempDir, ".wopal");

      await fs.ensureDir(wopalHome);
      await fs.writeFile(
        path.join(wopalHome, ".env"),
        "WOPAL_TEST_GLOBAL_ONLY=global-only-value",
      );

      process.env.WOPAL_HOME = wopalHome;
      delete process.env.WOPAL_TEST_GLOBAL_ONLY;

      loadEnv(false, undefined);

      expect(process.env.WOPAL_TEST_GLOBAL_ONLY).toBe("global-only-value");
    });
  });
});
