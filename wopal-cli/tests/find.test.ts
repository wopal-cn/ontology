import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "http";
import { execFile } from "child_process";
import path from "path";

const CLI_PATH = path.join(process.cwd(), "bin", "wopal");

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

function runCli(
  args: string[],
  envOverrides: NodeJS.ProcessEnv = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "node",
      [CLI_PATH, ...args],
      {
        encoding: "utf-8",
        timeout: 30000,
        env: { ...process.env, ...envOverrides },
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
  createSkills: (sourceHost: string) => MockSearchSkill[],
): Promise<MockSearchServer> {
  let skills: MockSearchSkill[] = [];

  const server = createServer((req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");

    if (url.pathname === "/.well-known/skills/index.json") {
      const sourceHost = req.headers.host || "127.0.0.1";
      const sourceSkills = skills.filter(
        (skill) => skill.source === sourceHost,
      );
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          skills: sourceSkills.map((skill) => ({
            name: skill.skillId || skill.name,
            description: `${skill.name} description`,
          })),
        }),
      );
      return;
    }

    const skillMatch = url.pathname.match(
      /^\/\.well-known\/skills\/([^/]+)\/SKILL\.md$/,
    );
    if (skillMatch) {
      const skillName = decodeURIComponent(skillMatch[1]!);
      const sourceHost = req.headers.host || "127.0.0.1";
      const skill = skills.find(
        (entry) =>
          entry.source === sourceHost &&
          (entry.skillId || entry.name) === skillName,
      );

      if (!skill) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      res.writeHead(200, { "Content-Type": "text/markdown" });
      res.end(
        `---\nname: ${skill.skillId || skill.name}\ndescription: ${skill.name} description\n---\n\n# ${skill.name}\n`,
      );
      return;
    }

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

  const sourceHost = `127.0.0.1:${address.port}`;
  skills = createSkills(sourceHost);

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

    server = await startMockSearchServer((sourceHost) => {
      const mockSkills: MockSearchSkill[] = [
        createSkill("smithery.ai", "smithery-ai-cli", 1121),
        createSkill("smithery.ai", "frontend-design", 381),
        createSkill("obra/superpowers", "using-superpowers", 21282),
        createSkill("skills.volces.com", "find-skills", 252),
        createSkill("skills.volces.com", "web-search", 118),
        createSkill("gpa-mcp.genai.prd.aws.saccap.int", "superpowers", 31),
        createSkill("saccap/int", "superpowers", 16),
      ];

      const localOpenspecSkills = [
        ["openspec-proposal-creation", 250],
        ["openspec-verify-change", 200],
        ["openspec-continue-change-cn", 180],
        ["openspecalpha-cn", 170],
        ["openspecbeta-cn", 160],
        ["openspec-skill-0", 100],
        ["openspec-skill-1", 99],
        ["openspec-skill-2", 98],
        ["openspec-skill-3", 97],
        ["openspec-skill-4", 96],
      ] as const;

      for (const [name, installs] of localOpenspecSkills) {
        mockSkills.push(createSkill(sourceHost, name, installs));
      }

      for (let i = 5; i < 20; i++) {
        mockSkills.push(
          createSkill(`test-source-${i}/repo`, `openspec-skill-${i}`, 100 - i),
        );
      }

      return mockSkills;
    });

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
      "Auto-verifying the top 5 result(s) by install count...",
    );
    expect(output).toContain(
      "Auto-verified the top 5 result(s) by install count. Use --verify to check all displayed results.",
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
    expect(parsed.data.verificationMode).toBe("top");
    expect(parsed.data.verifiedCount).toBe(3);
    expect(parsed.data.successfulVerificationCount).toBe(3);
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
      expect(skill).toHaveProperty("verified");
      expect(skill).toHaveProperty("verificationReason");
      expect(skill).toHaveProperty("warnings");
      expect(skill.url).toMatch(/^https:\/\/skills\.sh\//);
    }
  }, 30000);

  it("should auto-verify the top 5 displayed results by default", async () => {
    const output = await runCli([
      "skills",
      "find",
      "openspec",
      "--limit",
      "10",
    ]);

    expect(output).toContain(
      "Auto-verifying the top 5 result(s) by install count...",
    );
    expect(output).toContain(
      "Auto-verified the top 5 result(s) by install count. Use --verify to check all displayed results.",
    );
  }, 30000);

  it("should mark only auto-verified results in default JSON output", async () => {
    const output = await runCli([
      "skills",
      "find",
      "openspec",
      "--limit",
      "10",
      "--json",
    ]);

    const parsed = JSON.parse(output);

    expect(parsed.success).toBe(true);
    expect(parsed.data.verificationMode).toBe("top");
    expect(parsed.data.verifiedCount).toBe(5);
    expect(parsed.data.successfulVerificationCount).toBe(5);
    expect(
      parsed.data.skills
        .slice(0, 5)
        .every((skill: any) => skill.verified !== null),
    ).toBe(true);
    expect(
      parsed.data.skills
        .slice(5)
        .every((skill: any) => skill.verified === null),
    ).toBe(true);
  }, 30000);

  it("should disable auto-verification when configured to 0", async () => {
    const output = await runCli(
      ["skills", "find", "openspec", "--limit", "10"],
      { WOPAL_SKILLS_FIND_AUTO_VERIFY_COUNT: "0" },
    );

    expect(output).toContain(
      "Results are indexed from skills.sh and may be stale; use --verify to confirm downloadability.",
    );
    expect(output).not.toContain("Auto-verifying the top");
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
