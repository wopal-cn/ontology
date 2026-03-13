import { describe, expect, it } from "vitest";
import { parseDownloadSource } from "../src/lib/download-skill.js";

describe("parseDownloadSource", () => {
  it("parses GitHub owner/repo@skill format", () => {
    const parsed = parseDownloadSource("anthropics/skills@mcp-builder");

    expect(parsed).toEqual({
      type: "github",
      owner: "anthropics",
      repo: "skills",
      skill: "mcp-builder",
    });
  });

  it("parses well-known source@skill format", () => {
    const parsed = parseDownloadSource(
      "gpa-mcp.genai.prd.aws.saccap.int@superpowers",
    );

    expect(parsed).toEqual({
      type: "well-known",
      source: "gpa-mcp.genai.prd.aws.saccap.int",
      skill: "superpowers",
    });
  });

  it("parses skills.sh GitHub URL", () => {
    const parsed = parseDownloadSource(
      "https://skills.sh/obra/superpowers/using-superpowers",
    );

    expect(parsed).toEqual({
      type: "github",
      owner: "obra",
      repo: "superpowers",
      skill: "using-superpowers",
    });
  });

  it("parses skills.sh non-GitHub URL", () => {
    const parsed = parseDownloadSource(
      "https://skills.sh/smithery.ai/using-superpowers",
    );

    expect(parsed).toEqual({
      type: "well-known",
      source: "smithery.ai",
      skill: "using-superpowers",
    });
  });

  it("rejects local path source", () => {
    const parsed = parseDownloadSource("./local/path@my-skill");
    expect(parsed).toBeNull();
  });
});
