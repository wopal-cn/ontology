/**
 * Rule Injector - Rule injection into system prompt
 *
 * Handles tool ID querying and rule formatting/injection.
 */

import {
  readAndFormatRules,
  type DiscoveredRule,
  type MatchedRuleInfo,
} from "../rules/index.js";
import { extractConnectedMcpCapabilityIDs } from "./mcp-tools.js";
import type { DebugLog } from "../debug.js";

export interface RuleInjectorContext {
  client: unknown;
  directory: string;
  ruleFiles: DiscoveredRule[];
  rulesDebugLog: DebugLog;
}

/**
 * Query available tool IDs from OpenCode client.
 * Includes built-in tools + connected MCP capability IDs.
 */
export async function queryAvailableToolIDs(
  ctx: RuleInjectorContext,
): Promise<string[]> {
  const ids = new Set<string>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = ctx.client as any;
  const query = { directory: ctx.directory };

  const [toolResult, mcpResult] = await Promise.allSettled([
    client.tool?.ids?.({ query }),
    client.mcp?.status?.({ query }),
  ]);

  if (
    toolResult.status === "fulfilled" &&
    Array.isArray(toolResult.value?.data)
  ) {
    for (const id of toolResult.value.data) {
      ids.add(id);
    }
    // Removed verbose "Built-in tools" log - not useful for debugging
  } else if (toolResult.status === "rejected") {
    const message =
      toolResult.reason instanceof Error
        ? toolResult.reason.message
        : String(toolResult.reason);
    ctx.rulesDebugLog(`Warning: Failed to query tool IDs: ${message}`);
  }

  if (mcpResult.status === "fulfilled" && mcpResult.value?.data) {
    const mcpIds = extractConnectedMcpCapabilityIDs(mcpResult.value.data);
    for (const id of mcpIds) {
      ids.add(id);
    }
    if (mcpIds.length > 0) {
      ctx.rulesDebugLog(`MCP capability IDs: ${mcpIds.join(", ")}`);
    }
  } else if (mcpResult.status === "rejected") {
    const message =
      mcpResult.reason instanceof Error
        ? mcpResult.reason.message
        : String(mcpResult.reason);
    ctx.rulesDebugLog(`Warning: Failed to query MCP status: ${message}`);
  }

  return Array.from(ids);
}

/**
 * Format matched rules info for logging.
 * @param matchedRules - Array of matched rule info
 * @returns Array of formatted strings like "typescript.md (match reason)"
 */
function formatMatchedRulesForLog(matchedRules: MatchedRuleInfo[]): string[] {
  return matchedRules.map((rule) =>
    rule.reason === "unconditional" ? rule.name : `${rule.name} (${rule.reason})`,
  );
}

/**
 * Inject rules into system prompt.
 *
 * @param ctx - Rule injector context
 * @param contextPaths - Current context paths (normalized)
 * @param userPrompt - Latest user prompt (optional)
 * @param sessionID - Session ID for logging (optional)
 * @returns Formatted rules string or undefined if no applicable rules
 */
export async function injectRules(
  ctx: RuleInjectorContext,
  contextPaths: string[],
  userPrompt?: string,
  sessionID?: string,
): Promise<string | undefined> {
  const availableToolIDs = await queryAvailableToolIDs(ctx);

  const result = await readAndFormatRules(
    ctx.ruleFiles,
    contextPaths,
    userPrompt,
    availableToolIDs,
  );

  if (result.content) {
    const matchedRuleNames = formatMatchedRulesForLog(result.matchedRules);
    ctx.rulesDebugLog(
      `Injected ${matchedRuleNames.length} rules for session ${sessionID ?? "unknown"}: ${matchedRuleNames.join(", ")}`,
    );
    return result.content;
  } else {
    // No rules matched - show context for diagnosis
    const pathsPreview =
      contextPaths.length > 0
        ? contextPaths.slice(0, 3).join(", ") +
          (contextPaths.length > 3 ? "..." : "")
        : "none";
    const promptPreview = (userPrompt ?? "").slice(0, 50);
    ctx.rulesDebugLog(
      `No rules matched for session ${sessionID ?? "unknown"} (paths: ${pathsPreview}; prompt: "${promptPreview}")`,
    );
    return undefined;
  }
}