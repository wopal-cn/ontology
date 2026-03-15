import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, readFileSync, unlinkSync, mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { createDebugLog } from "./debug.js";

describe("createDebugLog", () => {
  let tempDir: string;
  let logFile: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "debug-test-"));
    logFile = join(tempDir, "test.log");
    process.env.OPENCODE_RULES_LOG_FILE = logFile;
  });

  afterEach(() => {
    delete process.env.OPENCODE_RULES_DEBUG;
    delete process.env.OPENCODE_RULES_LOG_FILE;
    if (existsSync(logFile)) {
      unlinkSync(logFile);
    }
  });

  it("writes to log file when OPENCODE_RULES_DEBUG is set", () => {
    process.env.OPENCODE_RULES_DEBUG = "1";
    const log = createDebugLog();
    log("test message");
    
    expect(existsSync(logFile)).toBe(true);
    const content = readFileSync(logFile, "utf-8");
    expect(content).toContain("[opencode-rules] test message");
  });

  it("does not write when OPENCODE_RULES_DEBUG is unset", () => {
    const log = createDebugLog();
    log("test message");
    
    expect(existsSync(logFile)).toBe(false);
  });

  it("uses custom prefix", () => {
    process.env.OPENCODE_RULES_DEBUG = "1";
    const log = createDebugLog("[custom]");
    log("hello");
    
    const content = readFileSync(logFile, "utf-8");
    expect(content).toContain("[custom] hello");
  });

  it("uses default path when OPENCODE_RULES_LOG_FILE is not set", () => {
    delete process.env.OPENCODE_RULES_LOG_FILE;
    process.env.OPENCODE_RULES_DEBUG = "1";
    
    const log = createDebugLog();
    log("default path test");
    
    // Default path should be in tmpdir
    const defaultLog = join(tmpdir(), "opencode-rules-debug.log");
    expect(existsSync(defaultLog)).toBe(true);
    
    // Cleanup
    if (existsSync(defaultLog)) {
      unlinkSync(defaultLog);
    }
  });
});
