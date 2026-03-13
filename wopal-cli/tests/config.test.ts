import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resetConfigForTest } from "../src/lib/config.js";

describe("config", () => {
  beforeEach(() => {
    resetConfigForTest();
    delete process.env.WOPAL_SKILLS_INBOX_DIR;
    delete process.env.WOPAL_SKILLS_DIR;
    delete process.env.WOPAL_GLOBAL_SKILLS_DIR;
    delete process.env.WOPAL_HOME;
    delete process.env.WOPAL_SETTINGS_PATH;
  });

  afterEach(() => {
    resetConfigForTest();
  });

  describe("resetConfigForTest", () => {
    it("should reset singleton instance", async () => {
      const { getConfig } = await import("../src/lib/config.js");

      const config1 = getConfig();
      resetConfigForTest();
      const config2 = getConfig();

      expect(config1).not.toBe(config2);
    });
  });

  describe("ConfigService two-phase initialization", () => {
    it("should not load env in constructor", async () => {
      const { ConfigService } = await import("../src/lib/config.js");
      const config = new ConfigService();

      // envLoaded 应为 false（Phase 1 仅加载配置文件）
      expect((config as any).envLoaded).toBe(false);
    });

    it("should load env on loadEnvForSpace call", async () => {
      const { ConfigService } = await import("../src/lib/config.js");
      const config = new ConfigService();

      config.loadEnvForSpace("/test/space");

      expect((config as any).envLoaded).toBe(true);
    });

    it("should only load env once", async () => {
      const { ConfigService } = await import("../src/lib/config.js");
      const config = new ConfigService();

      config.loadEnvForSpace("/test/space/a");
      config.loadEnvForSpace("/test/space/b");

      // 只加载一次，第二次调用应被忽略
      expect((config as any).envLoaded).toBe(true);
    });
  });

  describe("ConfigService environment variable priority", () => {
    it("should use WOPAL_SKILLS_INBOX_DIR when set", async () => {
      process.env.WOPAL_SKILLS_INBOX_DIR = "/custom/inbox";

      const { ConfigService } = await import("../src/lib/config.js");
      const config = new ConfigService();

      expect(config.getSkillsInboxDir()).toBe("/custom/inbox");
    });

    it("should use WOPAL_SKILLS_DIR when set", async () => {
      process.env.WOPAL_SKILLS_DIR = "/custom/skills";

      const { ConfigService } = await import("../src/lib/config.js");
      const config = new ConfigService();

      expect(config.getSkillsDir()).toBe("/custom/skills");
    });

    it("should use WOPAL_GLOBAL_SKILLS_DIR when set", async () => {
      process.env.WOPAL_GLOBAL_SKILLS_DIR = "/custom/global/skills";

      const { ConfigService } = await import("../src/lib/config.js");
      const config = new ConfigService();

      expect(config.getGlobalSkillsDir()).toBe("/custom/global/skills");
    });
  });

  describe("ConfigService default paths", () => {
    it("should return default inbox path relative to active space or cwd", async () => {
      const { ConfigService } = await import("../src/lib/config.js");
      const config = new ConfigService();
      const inboxDir = config.getSkillsInboxDir();

      expect(inboxDir).toContain(".wopal/skills/INBOX");
    });

    it("should return default skills dir relative to active space or cwd", async () => {
      const { ConfigService } = await import("../src/lib/config.js");
      const config = new ConfigService();
      const skillsDir = config.getSkillsDir();

      expect(skillsDir).toContain(".wopal/skills");
    });
  });

  describe("ConfigService space methods", () => {
    it("should list spaces", async () => {
      const { ConfigService } = await import("../src/lib/config.js");
      const config = new ConfigService();

      const spaces = config.listSpaces();
      expect(Array.isArray(spaces)).toBe(true);
    });

    it("should return active space when configured", async () => {
      const { ConfigService } = await import("../src/lib/config.js");
      const config = new ConfigService();

      const activeSpace = config.getActiveSpace();
      if (activeSpace) {
        expect(activeSpace.path).toBeDefined();
      } else {
        expect(activeSpace).toBeUndefined();
      }
    });

    it("should return undefined for non-existent space via getEffectiveSpace", async () => {
      const { ConfigService } = await import("../src/lib/config.js");
      const config = new ConfigService();

      expect(
        config.getEffectiveSpace("non-existent-space-xyz"),
      ).toBeUndefined();
    });

    it("should return undefined for non-existent space path", async () => {
      const { ConfigService } = await import("../src/lib/config.js");
      const config = new ConfigService();

      expect(
        config.getEffectiveSpacePath("non-existent-space-xyz"),
      ).toBeUndefined();
    });
  });

  describe("ConfigService global paths", () => {
    it("should return global skills dir under WOPAL_HOME", async () => {
      process.env.WOPAL_HOME = "/test/wopal-home";

      const { ConfigService } = await import("../src/lib/config.js");
      const config = new ConfigService();

      const globalSkillsDir = config.getGlobalSkillsDir();
      expect(globalSkillsDir).toBe("/test/wopal-home/skills");
    });

    it("should return global lock path under global skills dir", async () => {
      process.env.WOPAL_HOME = "/test/wopal-home";

      const { ConfigService } = await import("../src/lib/config.js");
      const config = new ConfigService();

      const globalLockPath = config.getGlobalLockPath();
      // 新路径：$WOPAL_HOME/skills/.skill-lock.json
      expect(globalLockPath).toBe("/test/wopal-home/skills/.skill-lock.json");
    });

    it("should return openclaw dir under WOPAL_HOME/storage", async () => {
      process.env.WOPAL_HOME = "/test/wopal-home";

      const { ConfigService } = await import("../src/lib/config.js");
      const config = new ConfigService();

      const openclawDir = config.getOpenclawDir();
      expect(openclawDir).toBe(
        "/test/wopal-home/storage/openclaw-security-monitor",
      );
    });
  });
});
