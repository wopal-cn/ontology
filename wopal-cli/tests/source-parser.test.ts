import { describe, it, expect } from "vitest";
import {
  parseSource,
  getOwnerRepo,
  parseOwnerRepo,
} from "../src/lib/source-parser.js";
import type { ParsedSource } from "../src/lib/types.js";

describe("source-parser", () => {
  describe("parseSource - local paths", () => {
    it("should parse absolute path", () => {
      const result = parseSource("/absolute/path/to/skill");
      expect(result.type).toBe("local");
      expect(result.localPath).toBe("/absolute/path/to/skill");
    });

    it("should parse relative path with ./", () => {
      const result = parseSource("./relative/skill");
      expect(result.type).toBe("local");
      expect(result.localPath).toContain("relative/skill");
    });

    it("should parse relative path with ../", () => {
      const result = parseSource("../parent/skill");
      expect(result.type).toBe("local");
      expect(result.localPath).toContain("parent/skill");
    });

    it("should parse current directory", () => {
      const result = parseSource(".");
      expect(result.type).toBe("local");
    });

    it("should parse Windows absolute path", () => {
      const result = parseSource("C:\\Users\\skill");
      expect(result.type).toBe("local");
    });
  });

  describe("parseSource - GitHub URLs", () => {
    it("should parse GitHub URL", () => {
      const result = parseSource("https://github.com/owner/repo");
      expect(result.type).toBe("github");
      expect(result.url).toBe("https://github.com/owner/repo.git");
    });

    it("should parse GitHub URL with tree/branch", () => {
      const result = parseSource("https://github.com/owner/repo/tree/develop");
      expect(result.type).toBe("github");
      expect(result.url).toBe("https://github.com/owner/repo.git");
      expect(result.ref).toBe("develop");
    });

    it("should parse GitHub URL with tree/branch/path", () => {
      const result = parseSource(
        "https://github.com/owner/repo/tree/main/skills/my-skill",
      );
      expect(result.type).toBe("github");
      expect(result.url).toBe("https://github.com/owner/repo.git");
      expect(result.ref).toBe("main");
      expect(result.subpath).toBe("skills/my-skill");
    });

    it("should parse GitHub shorthand owner/repo", () => {
      const result = parseSource("owner/repo");
      expect(result.type).toBe("github");
      expect(result.url).toBe("https://github.com/owner/repo.git");
    });

    it("should parse GitHub shorthand with @skill", () => {
      const result = parseSource("owner/repo@my-skill");
      expect(result.type).toBe("github");
      expect(result.url).toBe("https://github.com/owner/repo.git");
      expect(result.skillFilter).toBe("my-skill");
    });

    it("should parse GitHub shorthand with subpath", () => {
      const result = parseSource("owner/repo/skills/my-skill");
      expect(result.type).toBe("github");
      expect(result.url).toBe("https://github.com/owner/repo.git");
      expect(result.subpath).toBe("skills/my-skill");
    });
  });

  describe("parseSource - GitLab URLs", () => {
    it("should parse GitLab URL", () => {
      const result = parseSource("https://gitlab.com/owner/repo");
      expect(result.type).toBe("gitlab");
      expect(result.url).toBe("https://gitlab.com/owner/repo.git");
    });

    it("should parse GitLab URL with subgroup", () => {
      const result = parseSource("https://gitlab.com/group/subgroup/repo");
      expect(result.type).toBe("gitlab");
      expect(result.url).toBe("https://gitlab.com/group/subgroup/repo.git");
    });

    it("should parse GitLab URL with tree/branch", () => {
      const result = parseSource(
        "https://gitlab.com/owner/repo/-/tree/develop",
      );
      expect(result.type).toBe("gitlab");
      expect(result.url).toBe("https://gitlab.com/owner/repo.git");
      expect(result.ref).toBe("develop");
    });

    it("should parse GitLab URL with tree/branch/path", () => {
      const result = parseSource(
        "https://gitlab.com/owner/repo/-/tree/main/skills/my-skill",
      );
      expect(result.type).toBe("gitlab");
      expect(result.url).toBe("https://gitlab.com/owner/repo.git");
      expect(result.ref).toBe("main");
      expect(result.subpath).toBe("skills/my-skill");
    });
  });

  describe("parseSource - other URLs", () => {
    it("should parse well-known URL as well-known type", () => {
      const result = parseSource("https://example.com/skills");
      expect(result.type).toBe("well-known");
      expect(result.url).toBe("https://example.com/skills");
    });

    it("should parse direct git URL as git type", () => {
      const result = parseSource("https://custom-git.com/owner/repo.git");
      expect(result.type).toBe("git");
      expect(result.url).toBe("https://custom-git.com/owner/repo.git");
    });

    it("should not treat .git URLs as well-known", () => {
      const result = parseSource("https://example.com/repo.git");
      expect(result.type).toBe("git");
    });
  });

  describe("parseSource - source aliases", () => {
    it("should resolve source alias", () => {
      const result = parseSource("coinbase/agentWallet");
      expect(result.type).toBe("github");
      expect(result.url).toBe(
        "https://github.com/coinbase/agentic-wallet-skills.git",
      );
    });
  });

  describe("getOwnerRepo", () => {
    it("should return null for local paths", () => {
      const parsed: ParsedSource = {
        type: "local",
        url: "/local/path",
        localPath: "/local/path",
      };
      expect(getOwnerRepo(parsed)).toBeNull();
    });

    it("should extract owner/repo from GitHub URL", () => {
      const parsed: ParsedSource = {
        type: "github",
        url: "https://github.com/owner/repo.git",
      };
      expect(getOwnerRepo(parsed)).toBe("owner/repo");
    });

    it("should extract owner/repo from GitLab URL with subgroup", () => {
      const parsed: ParsedSource = {
        type: "gitlab",
        url: "https://gitlab.com/group/subgroup/repo.git",
      };
      expect(getOwnerRepo(parsed)).toBe("group/subgroup/repo");
    });

    it("should extract owner/repo from SSH URL", () => {
      const parsed: ParsedSource = {
        type: "github",
        url: "git@github.com:owner/repo.git",
      };
      expect(getOwnerRepo(parsed)).toBe("owner/repo");
    });

    it("should return null for URL without owner/repo", () => {
      const parsed: ParsedSource = {
        type: "git",
        url: "https://example.com",
      };
      expect(getOwnerRepo(parsed)).toBeNull();
    });
  });

  describe("parseOwnerRepo", () => {
    it("should parse valid owner/repo", () => {
      const result = parseOwnerRepo("owner/repo");
      expect(result).toEqual({ owner: "owner", repo: "repo" });
    });

    it("should return null for invalid format", () => {
      expect(parseOwnerRepo("invalid")).toBeNull();
      expect(parseOwnerRepo("owner/repo/extra")).toBeNull();
      expect(parseOwnerRepo("")).toBeNull();
    });
  });

  describe("parseSource - edge cases", () => {
    it("should handle GitHub URL with .git suffix", () => {
      const result = parseSource("https://github.com/owner/repo.git");
      expect(result.type).toBe("github");
      expect(result.url).toBe("https://github.com/owner/repo.git");
    });

    it("should exclude raw.githubusercontent.com from well-known", () => {
      const result = parseSource(
        "https://raw.githubusercontent.com/owner/repo/main/file",
      );
      expect(result.type).toBe("git");
    });
  });
});
