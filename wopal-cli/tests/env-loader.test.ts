import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { loadEnv } from "../src/lib/env-loader.js";
import { homedir } from "os";

describe("env-loader", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  describe("loadEnv", () => {
    it("should not throw when .env files don't exist", () => {
      expect(() => loadEnv(false)).not.toThrow();
    });

    it("should expand ~ in environment variables", () => {
      process.env.TEST_PATH = "~/test/path";

      loadEnv(false);

      expect(process.env.TEST_PATH).toContain(homedir());
      expect(process.env.TEST_PATH).not.toContain("~");

      delete process.env.TEST_PATH;
    });

    it("should handle debug mode without errors", () => {
      expect(() => loadEnv(true)).not.toThrow();
    });
  });
});
