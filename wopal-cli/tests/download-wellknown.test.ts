import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs-extra";
import os from "os";
import path from "path";
import type { ProgramContext } from "../src/program/types.js";
import { downloadFromWellKnown } from "../src/lib/download-skill.js";
import { readMetadata } from "../src/lib/metadata.js";

function createContext(): ProgramContext {
  return {
    version: "test",
    debug: false,
    config: {} as ProgramContext["config"],
    output: { print: vi.fn() } as unknown as ProgramContext["output"],
  };
}

describe("downloadFromWellKnown", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wopal-wellknown-test-"));
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await fs.remove(tempDir);
  });

  it("downloads skill files and metadata from well-known endpoint", async () => {
    const responses: Record<string, { ok: boolean; body: unknown }> = {
      "https://example.com/.well-known/skills/index.json": {
        ok: true,
        body: {
          skills: [
            {
              name: "superpowers",
              description: "Use superpowers skill",
              files: ["references/guide.md"],
            },
          ],
        },
      },
      "https://example.com/.well-known/skills/superpowers/SKILL.md": {
        ok: true,
        body: `---\nname: superpowers\ndescription: Use superpowers skill\n---\n# Superpowers`,
      },
      "https://example.com/.well-known/skills/superpowers/references/guide.md":
        {
          ok: true,
          body: "Guide content",
        },
    };

    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      const matched = responses[url];

      if (!matched) {
        return {
          ok: false,
          status: 404,
          json: async () => ({}),
          text: async () => "",
        };
      }

      return {
        ok: matched.ok,
        status: matched.ok ? 200 : 404,
        json: async () => matched.body,
        text: async () => String(matched.body),
      };
    });

    vi.stubGlobal("fetch", fetchMock);

    const result = await downloadFromWellKnown(
      "example.com",
      "superpowers",
      tempDir,
      { force: true },
      createContext(),
    );

    expect(result.success).toEqual(["superpowers"]);
    expect(result.failed).toEqual([]);

    const skillDir = path.join(tempDir, "superpowers");
    expect(await fs.pathExists(path.join(skillDir, "SKILL.md"))).toBe(true);
    expect(
      await fs.pathExists(path.join(skillDir, "references", "guide.md")),
    ).toBe(true);

    const metadata = await readMetadata(skillDir);
    expect(metadata).not.toBeNull();
    expect(metadata?.source).toBe("example.com@superpowers");
    expect(metadata?.sourceUrl).toBe("https://example.com");
    expect(typeof metadata?.skillFolderHash).toBe("string");
    expect(metadata?.skillFolderHash?.length).toBeGreaterThan(0);
  });

  it("returns friendly error when source does not support well-known protocol", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 404,
      json: async () => ({}),
      text: async () => "",
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await downloadFromWellKnown(
      "unknown-source.example",
      "superpowers",
      tempDir,
      { force: true },
      createContext(),
    );

    expect(result.success).toEqual([]);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]?.error).toContain(
      "does not support well-known protocol",
    );
  });
});
