import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { resetConfigForTest } from "../src/lib/config.js";

describe("config", () => {
  beforeEach(() => {
    resetConfigForTest();
    delete process.env.WOPAL_SKILLS_INBOX_DIR;
    delete process.env.WOPAL_SKILLS_IOCDB_DIR;
    delete process.env.WOPAL_SKILLS_DIR;
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

  describe("ConfigService environment variable priority", () => {
    it("should use WOPAL_SKILLS_INBOX_DIR when set", async () => {
      process.env.WOPAL_SKILLS_INBOX_DIR = "/custom/inbox";

      const { ConfigService } = await import("../src/lib/config.js");
      const config = new ConfigService();

      expect(config.getSkillInboxDir()).toBe("/custom/inbox");
    });

    it("should use WOPAL_SKILLS_IOCDB_DIR when set", async () => {
      process.env.WOPAL_SKILLS_IOCDB_DIR = "/custom/iocdb";

      const { ConfigService } = await import("../src/lib/config.js");
      const config = new ConfigService();

      expect(config.getSkillIocdbDir()).toBe("/custom/iocdb");
    });

    it("should use WOPAL_SKILLS_DIR when set", async () => {
      process.env.WOPAL_SKILLS_DIR = "/custom/skills";

      const { ConfigService } = await import("../src/lib/config.js");
      const config = new ConfigService();

      expect(config.getSkillsInstallDir()).toBe("/custom/skills");
    });
  });

  describe("ConfigService default paths", () => {
    it("should return default inbox path with warning", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const { ConfigService } = await import("../src/lib/config.js");
      const config = new ConfigService();
      const inboxDir = config.getSkillInboxDir();

      expect(inboxDir).toContain(".wopal/skills/INBOX");
      expect(warnSpy).toHaveBeenCalled();

      warnSpy.mockRestore();
    });
  });

  describe("deprecated environment variables", () => {
    it("should warn about WOPAL_SKILL_INBOX_DIR deprecation", async () => {
      process.env.WOPAL_SKILL_INBOX_DIR = "/old/inbox";
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const { ConfigService } = await import("../src/lib/config.js");
      new ConfigService();

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("deprecated"),
      );

      warnSpy.mockRestore();
    });
  });
});
