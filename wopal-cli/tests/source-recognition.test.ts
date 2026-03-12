import { describe, it, expect } from "vitest";
import path from "path";

describe("Source Type Recognition", () => {
  function isLocalSource(source: string): boolean {
    return (
      source.includes("/") || source.includes("\\") || source.includes(path.sep)
    );
  }

  it("should identify INBOX source (simple name)", () => {
    expect(isLocalSource("skill-name")).toBe(false);
    expect(isLocalSource("my-skill")).toBe(false);
    expect(isLocalSource("test")).toBe(false);
  });

  it("should identify local source (path with slash)", () => {
    expect(isLocalSource("./skills/my-skill")).toBe(true);
    expect(isLocalSource("/absolute/path/skill")).toBe(true);
    expect(isLocalSource("relative/path/skill")).toBe(true);
    expect(isLocalSource("my-skills/test-skill")).toBe(true);
  });

  it("should identify local source (Windows path)", () => {
    expect(isLocalSource("C:\\Users\\skill")).toBe(true);
    expect(isLocalSource("skills\\test")).toBe(true);
  });

  it("should handle edge cases", () => {
    expect(isLocalSource("")).toBe(false);
    expect(isLocalSource(".")).toBe(false);
    expect(isLocalSource("..")).toBe(false);
  });
});
