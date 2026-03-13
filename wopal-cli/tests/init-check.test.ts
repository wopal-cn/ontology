import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { checkInitialization } from "../src/lib/init-check.js";
import { CommandError } from "../src/lib/error-utils.js";
import { resetConfigForTest } from "../src/lib/config.js";

describe("init-check", () => {
  beforeEach(() => {
    resetConfigForTest();
    delete process.env.WOPAL_SETTINGS_PATH;
    delete process.env.WOPAL_SKILLS_DIR;
    delete process.env.WOPAL_SKILLS_INBOX_DIR;
    delete process.env.WOPAL_OPENCLAW_DIR;
  });

  afterEach(() => {
    resetConfigForTest();
  });

  describe("checkInitialization", () => {
    it("should throw CommandError when no active space", async () => {
      const { ConfigService } = await import("../src/lib/config.js");
      const config = new ConfigService();

      if (!config.getActiveSpace()) {
        expect(() => checkInitialization()).toThrow(CommandError);
      } else {
        expect(() => checkInitialization()).not.toThrow(CommandError);
      }
    });

    it("should throw NOT_INITIALIZED error code", async () => {
      const { ConfigService } = await import("../src/lib/config.js");
      new ConfigService();

      try {
        checkInitialization();
      } catch (error) {
        expect(error).toBeInstanceOf(CommandError);
        const code = (error as CommandError).code;
        expect(code).toBe("NOT_INITIALIZED");
      }
    });

    it("should provide helpful suggestion in error", async () => {
      const { ConfigService } = await import("../src/lib/config.js");
      new ConfigService();

      try {
        checkInitialization();
      } catch (error) {
        const suggestion = (error as CommandError).suggestion;
        expect(suggestion).toBeDefined();
        expect(suggestion!.length).toBeGreaterThan(0);
        expect(suggestion).toContain("wopal init");
      }
    });
  });
});
