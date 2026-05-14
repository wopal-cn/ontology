import { describe, it, expect } from "vitest";
import { queryAvailableToolIDs, type RuleInjectorContext } from "./rule-injector.js";

describe("OpenCodeRulesRuntime.queryAvailableToolIDs", () => {
  it("augments tool ids with connected mcp capability ids", async () => {
    const ctx: RuleInjectorContext = {
      client: {
        tool: { ids: async () => ({ data: ["bash"] }) },
        mcp: {
          status: async () => ({
            data: { context7: { status: "connected" } },
          }),
        },
      } as any,
      directory: "/tmp",
      ruleFiles: [],
      rulesDebugLog: () => {},
    };

    const ids = await queryAvailableToolIDs(ctx);
    expect(ids).toContain("bash");
    expect(ids).toContain("mcp_context7");
  });

  it("handles missing mcp.status gracefully", async () => {
    const ctx: RuleInjectorContext = {
      client: {
        tool: { ids: async () => ({ data: ["bash"] }) },
        // no mcp property
      } as any,
      directory: "/tmp",
      ruleFiles: [],
      rulesDebugLog: () => {},
    };

    const ids = await queryAvailableToolIDs(ctx);
    expect(ids).toContain("bash");
    // Should not throw, just not include mcp_ ids
  });
});
