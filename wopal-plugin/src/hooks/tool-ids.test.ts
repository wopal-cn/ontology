import { describe, it, expect } from "vitest";
import { createSystemTransformHooks } from "./system-transform.js";
import { createHookContext } from "./index.js";
import { SessionStore } from "../session-store.js";

describe("OpenCodeRulesRuntime.queryAvailableToolIDs", () => {
  it("augments tool ids with connected mcp capability ids", async () => {
    const ctx = createHookContext({
      client: {
        tool: { ids: async () => ({ data: ["bash"] }) },
        mcp: {
          status: async () => ({
            data: { context7: { status: "connected" } },
          }),
        },
      } as any,
      directory: "/tmp",
      projectDirectory: "/tmp",
      ruleFiles: [],
      sessionStore: new SessionStore({ max: 10 }),
      debugLog: () => {},
    });

    const hooks = createSystemTransformHooks(ctx as never);
    const ids: string[] = await hooks._queryAvailableToolIDs();
    expect(ids).toContain("bash");
    expect(ids).toContain("mcp_context7");
  });

  it("handles missing mcp.status gracefully", async () => {
    const ctx = createHookContext({
      client: {
        tool: { ids: async () => ({ data: ["bash"] }) },
        // no mcp property
      } as any,
      directory: "/tmp",
      projectDirectory: "/tmp",
      ruleFiles: [],
      sessionStore: new SessionStore({ max: 10 }),
      debugLog: () => {},
    });

    const hooks = createSystemTransformHooks(ctx as never);
    const ids: string[] = await hooks._queryAvailableToolIDs();
    expect(ids).toContain("bash");
    // Should not throw, just not include mcp_ ids
  });
});