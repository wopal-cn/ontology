import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "http";
import { execFile } from "child_process";
import path from "path";

const CLI_PATH = path.join(process.cwd(), "bin", "cli.js");

interface MockSearchSkill {
  id: string;
  skillId?: string;
  name: string;
  installs: number;
  source: string;
}

interface MockSearchServer {
  baseUrl: string;
  close: () => Promise<void>;
}

function runCli(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "node",
      [CLI_PATH, ...args],
      {
        encoding: "utf-8",
        timeout: 30000,
        env: { ...process.env },
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(
            Object.assign(error, {
              stdout,
              stderr,
              message: `${error.message}\n${stdout || ""}${stderr || ""}`,
            }),
          );
          return;
        }
        resolve(stdout);
      },
    );
  });
}

function createSkill(
  source: string,
  name: string,
  installs: number,
  skillId?: string,
): MockSearchSkill {
  return {
    id: `${source}/${skillId || name}`,
    name,
    skillId,
    installs,
    source,
  };
}

async function startMockSearchServer(
  skills: MockSearchSkill[],
): Promise<MockSearchServer> {
  const server = createServer((req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");

    if (url.pathname !== "/api/search") {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const query = (url.searchParams.get("q") || "").toLowerCase();
    const limit = Number(url.searchParams.get("limit") || skills.length);

    const filtered = skills
      .filter((skill) => {
        const fullName =
          `${skill.source}/${skill.skillId || skill.name}`.toLowerCase();
        return (
          skill.name.toLowerCase().includes(query) ||
          (skill.skillId || "").toLowerCase().includes(query) ||
          skill.source.toLowerCase().includes(query) ||
          fullName.includes(query)
        );
      })
      .sort((a, b) => b.installs - a.installs);

    const response = {
      query,
      searchType: "keyword",
      skills: filtered.slice(0, limit),
      count: filtered.length,
    };

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(response));
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to resolve mock search server address");
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}/api/search`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      }),
  };
}

describe("wopal skills find command", () => {
  const originalEnv = { ...process.env };
  let server: MockSearchServer;

  beforeEach(async () => {
    process.env = { ...originalEnv };

    const mockSkills: MockSearchSkill[] = [
      createSkill("smithery.ai", "smithery-ai-cli", 1121),
      createSkill("smithery.ai", "frontend-design", 381),
      createSkill("forztf/open-skilled-sdd", "openspec-proposal-creation", 250),
      createSkill("forztf/open-skilled-sdd", "openspec-verify-change", 200),
      createSkill(
        "forztf/open-skilled-sdd",
        "openspec-continue-change-cn",
        180,
      ),
      createSkill("forztf/open-skilled-sdd", "openspecalpha-cn", 170),
      createSkill("forztf/open-skilled-sdd", "openspecbeta-cn", 160),
      createSkill("skills.volces.com", "find-skills", 252),
      createSkill("skills.volces.com", "web-search", 118),
      createSkill("gpa-mcp.genai.prd.aws.saccap.int", "superpowers", 31),
      createSkill("saccap/int", "superpowers", 16),
      createSkill("obra/superpowers", "using-superpowers", 21282),
    ];

    for (let i = 0; i < 20; i++) {
      mockSkills.push(
        createSkill(`test-source-${i}/repo`, `openspec-skill-${i}`, 100 - i),
      );
    }

    server = await startMockSearchServer(mockSkills);
    process.env.WOPAL_SKILLS_SEARCH_API_BASE = server.baseUrl;
  });

  afterEach(async () => {
    process.env = originalEnv;
    await server.close();
  });

  it("should search skills with default limit (20)", async () => {
    const output = await runCli([
      "skills",
      "find",
      "openspec",
      "--limit",
      "20",
    ]);

    expect(output).toContain("Found");
    expect(output).toContain("showing 20");
    expect(output).toContain("installs");
    expect(output).toContain(
      "Results are indexed from skills.sh and may be stale",
    );
    expect(output).toContain("Download with: wopal skills download");
  }, 30000);

  it("should search skills with custom limit", async () => {
    const output = await runCli(["skills", "find", "openspec", "--limit", "5"]);

    expect(output).toContain("showing 5");
    expect(output).toContain("Download with: wopal skills download");
  }, 30000);

  it("should show all results with --limit 0 (max 100)", async () => {
    const output = await runCli([
      "skills",
      "find",
      "openspec",
      "--limit",
      "0",
      "--json",
    ]);

    const parsed = JSON.parse(output);

    expect(parsed.success).toBe(true);
    expect(parsed.data.skills.length).toBeLessThanOrEqual(100);
  }, 30000);

  it("should output JSON format with --json flag", async () => {
    const output = await runCli([
      "skills",
      "find",
      "openspec",
      "--limit",
      "3",
      "--json",
    ]);

    const parsed = JSON.parse(output);

    expect(parsed.success).toBe(true);
    expect(parsed.data).toBeDefined();
    expect(parsed.data.query).toBe("openspec");
    expect(parsed.data.verified).toBe(false);
    expect(parsed.data.skills).toBeInstanceOf(Array);
    expect(parsed.data.skills.length).toBeLessThanOrEqual(3);

    if (parsed.data.skills.length > 0) {
      const skill = parsed.data.skills[0];
      expect(skill).toHaveProperty("id");
      expect(skill).toHaveProperty("name");
      expect(skill).toHaveProperty("source");
      expect(skill).toHaveProperty("downloadSource");
      expect(skill).toHaveProperty("installs");
      expect(skill).toHaveProperty("url");
      expect(skill.url).toMatch(/^https:\/\/skills\.sh\//);
    }
  }, 30000);

  it("should handle no results found", async () => {
    const output = await runCli([
      "skills",
      "find",
      "zzzzzzzzznonexistent12345",
    ]);

    expect(output).toContain("No skills found");
  }, 30000);

  it("should handle no results with JSON output", async () => {
    const output = await runCli([
      "skills",
      "find",
      "zzzzzzzzznonexistent12345",
      "--json",
    ]);

    const parsed = JSON.parse(output);

    expect(parsed.success).toBe(true);
    expect(parsed.data.skills).toEqual([]);
    expect(parsed.data.total).toBe(0);
  }, 30000);

  it("should show help with --help flag", async () => {
    const output = await runCli(["skills", "find", "--help"]);

    expect(output).toContain("Search for skills on skills.sh");
    expect(output).toContain("--limit");
    expect(output).toContain("--verify");
    expect(output).toContain("--json");
    expect(output).toContain("EXAMPLES");
  });

  it("should format install counts correctly", async () => {
    const output = await runCli([
      "skills",
      "find",
      "openspec",
      "--limit",
      "5",
      "--json",
    ]);

    const parsed = JSON.parse(output);

    expect(parsed.success).toBe(true);
    expect(parsed.data.skills).toBeInstanceOf(Array);

    if (parsed.data.skills.length > 0) {
      const skill = parsed.data.skills[0];
      expect(typeof skill.installs).toBe("number");
      expect(skill.installs).toBeGreaterThanOrEqual(0);
    }
  }, 30000);

  it("should return skills sorted by install count descending", async () => {
    const output = await runCli([
      "skills",
      "find",
      "openspec",
      "--limit",
      "10",
      "--json",
    ]);

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

  it("should require query argument", async () => {
    try {
      await runCli(["skills", "find"]);
      expect.fail("Should have thrown an error");
    } catch (error: any) {
      const message = `${error.stdout || ""}${error.stderr || ""}`;
      expect(message).toContain("missing required argument");
    }
  });

  it("should support wildcard * pattern", async () => {
    const output = await runCli(["skills", "find", "openspec*cn", "--json"]);

    const parsed = JSON.parse(output);

    expect(parsed.success).toBe(true);
    expect(parsed.data.skills).toBeInstanceOf(Array);

    for (const skill of parsed.data.skills) {
      expect(skill.name).toMatch(/^openspec.*cn$/i);
    }
  }, 30000);

  it("should support wildcard with limit", async () => {
    const output = await runCli([
      "skills",
      "find",
      "openspec*cn",
      "--limit",
      "2",
    ]);

    expect(output).toContain("showing 2");
    expect(output).toContain("Download with: wopal skills download");
  }, 30000);

  it("should handle wildcard with no matches", async () => {
    const output = await runCli(["skills", "find", "zzzzz*nonexistent99999"]);

    expect(output).toContain("No skills found");
  }, 30000);
});
