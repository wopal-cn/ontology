import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execSync } from "child_process";
import path from "path";

const CLI_PATH = path.join(process.cwd(), "bin", "cli.js");

describe("wopal skills find command", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should search skills with default limit (20)", () => {
    const output = execSync(
      `node ${CLI_PATH} skills find openspec --limit 20`,
      {
        encoding: "utf-8",
        timeout: 30000,
      },
    );

    expect(output).toContain("Found");
    expect(output).toContain("skill(s)");
    expect(output).toContain("installs");
    expect(output).toContain("Download with: wopal skills download");
  }, 30000);

  it("should search skills with custom limit", () => {
    const output = execSync(`node ${CLI_PATH} skills find openspec --limit 5`, {
      encoding: "utf-8",
      timeout: 30000,
    });

    expect(output).toContain("showing 5");
    expect(output).toContain("Download with: wopal skills download");
  }, 30000);

  it("should show all results with --limit 0 (max 100)", () => {
    const output = execSync(
      `node ${CLI_PATH} skills find openspec --limit 0 --json`,
      {
        encoding: "utf-8",
        timeout: 30000,
      },
    );

    const parsed = JSON.parse(output);

    expect(parsed.success).toBe(true);
    expect(parsed.data.skills.length).toBeLessThanOrEqual(100);
  }, 30000);

  it("should output JSON format with --json flag", () => {
    const output = execSync(
      `node ${CLI_PATH} skills find openspec --limit 3 --json`,
      {
        encoding: "utf-8",
        timeout: 30000,
      },
    );

    const parsed = JSON.parse(output);

    expect(parsed.success).toBe(true);
    expect(parsed.data).toBeDefined();
    expect(parsed.data.query).toBe("openspec");
    expect(parsed.data.skills).toBeInstanceOf(Array);
    expect(parsed.data.skills.length).toBeLessThanOrEqual(3);

    if (parsed.data.skills.length > 0) {
      const skill = parsed.data.skills[0];
      expect(skill).toHaveProperty("id");
      expect(skill).toHaveProperty("name");
      expect(skill).toHaveProperty("source");
      expect(skill).toHaveProperty("installs");
      expect(skill).toHaveProperty("url");
      expect(skill.url).toMatch(/^https:\/\/skills\.sh\//);
    }
  }, 30000);

  it("should handle no results found", () => {
    const output = execSync(
      `node ${CLI_PATH} skills find "zzzzzzzzznonexistent12345"`,
      {
        encoding: "utf-8",
        timeout: 30000,
      },
    );

    expect(output).toContain("No skills found");
  }, 30000);

  it("should handle no results with JSON output", () => {
    const output = execSync(
      `node ${CLI_PATH} skills find "zzzzzzzzznonexistent12345" --json`,
      {
        encoding: "utf-8",
        timeout: 30000,
      },
    );

    const parsed = JSON.parse(output);

    expect(parsed.success).toBe(true);
    expect(parsed.data.skills).toEqual([]);
    expect(parsed.data.total).toBe(0);
  }, 30000);

  it("should show help with --help flag", () => {
    const output = execSync(`node ${CLI_PATH} skills find --help`, {
      encoding: "utf-8",
    });

    expect(output).toContain("Search for skills on skills.sh");
    expect(output).toContain("--limit");
    expect(output).toContain("--json");
    expect(output).toContain("EXAMPLES");
  });

  it("should format install counts correctly", () => {
    const output = execSync(
      `node ${CLI_PATH} skills find openspec --limit 5 --json`,
      {
        encoding: "utf-8",
        timeout: 30000,
      },
    );

    const parsed = JSON.parse(output);

    expect(parsed.success).toBe(true);
    expect(parsed.data.skills).toBeInstanceOf(Array);

    if (parsed.data.skills.length > 0) {
      const skill = parsed.data.skills[0];
      expect(typeof skill.installs).toBe("number");
      expect(skill.installs).toBeGreaterThanOrEqual(0);
    }
  }, 30000);

  it("should return skills sorted by install count descending", () => {
    const output = execSync(
      `node ${CLI_PATH} skills find openspec --limit 10 --json`,
      {
        encoding: "utf-8",
        timeout: 30000,
      },
    );

    const parsed = JSON.parse(output);
    const skills = parsed.data.skills;

    if (skills.length > 1) {
      for (let i = 1; i < skills.length; i++) {
        expect(skills[i - 1].installs).toBeGreaterThanOrEqual(
          skills[i].installs,
        );
      }
    }
  }, 30000);

  it("should require query argument", () => {
    try {
      execSync(`node ${CLI_PATH} skills find`, {
        encoding: "utf-8",
        stdio: "pipe",
      });
      expect.fail("Should have thrown an error");
    } catch (error: any) {
      const message = `${error.stdout || ""}${error.stderr || ""}`;
      expect(message).toContain("missing required argument");
    }
  });

  it("should support wildcard * pattern", () => {
    const output = execSync(
      `node ${CLI_PATH} skills find "openspec*cn" --json`,
      {
        encoding: "utf-8",
        timeout: 30000,
      },
    );

    const parsed = JSON.parse(output);

    expect(parsed.success).toBe(true);
    expect(parsed.data.skills).toBeInstanceOf(Array);

    for (const skill of parsed.data.skills) {
      expect(skill.name).toMatch(/^openspec.*cn$/i);
    }
  }, 30000);

  it("should support wildcard with limit", () => {
    const output = execSync(
      `node ${CLI_PATH} skills find "openspec*cn" --limit 2`,
      {
        encoding: "utf-8",
        timeout: 30000,
      },
    );

    expect(output).toContain("skill(s)");
    expect(output).toContain("Download with: wopal skills download");
  }, 30000);

  it("should handle wildcard with no matches", () => {
    const output = execSync(
      `node ${CLI_PATH} skills find "zzzzz*nonexistent99999"`,
      {
        encoding: "utf-8",
        timeout: 30000,
      },
    );

    expect(output).toContain("No skills found");
  }, 30000);
});
