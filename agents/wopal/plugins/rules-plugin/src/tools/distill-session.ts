/**
 * distill_session Tool - Manual Memory Extraction
 *
 * Triggers distillation of current session to extract memories
 * and regenerate session title.
 */

import { tool, type ToolDefinition, type ToolContext } from "@opencode-ai/plugin";
import type { DistillEngine, PreviewCandidate } from "../memory/distill.js";
import { clearExtractionState, getPendingConfirmation, setPendingConfirmation, clearPendingConfirmation } from "../memory/distill.js";

import type { SessionMessage } from "../types.js";
import { createDebugLog } from "../debug.js";

const debugLog = createDebugLog("[wopal-memory]", "memory");

/**
 * Create distill_session tool
 *
 * @param distillEngine - Distill engine instance
 * @param _store - Memory store (kept for API compatibility)
 * @param client - OpenCode client for session.messages() access
 */
export function createDistillSessionTool(
  distillEngine: DistillEngine,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _store: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any
): ToolDefinition {
  return tool({
    description:
      "Distill current session: Step 1 - Preview candidates for review. Step 2 - Confirm to write. Use action='preview' to extract without writing, action='confirm' to write pending candidates, action='cancel' to discard.",
    args: {
      action: tool.schema
        .enum(["preview", "confirm", "cancel"])
        .describe("Action: 'preview' to extract and show candidates, 'confirm' to write to database, 'cancel' to discard"),
      force: tool.schema
        .boolean()
        .optional()
        .describe("Force re-distillation even if already extracted (only for preview)"),
      selectedIndices: tool.schema
        .array(tool.schema.number())
        .optional()
        .describe("Optional: indices of candidates to write (0-based). If not provided, all candidates will be written."),
    },
    execute: async (
      args: { action: "preview" | "confirm" | "cancel"; force?: boolean; selectedIndices?: number[] },
      context: ToolContext
    ): Promise<string> => {
      const sessionID = context.sessionID;

      debugLog(`[distill_session] ========== TOOL INVOKED ==========`);
      debugLog(`[distill_session] Action: ${args.action}`);
      debugLog(`[distill_session] Session: ${sessionID ?? "N/A"}`);
      debugLog(`[distill_session] Force: ${args.force ?? false}`);
      debugLog(`[distill_session] Selected indices: ${args.selectedIndices?.join(",") ?? "none"}`);

      if (!sessionID) {
        debugLog(`[distill_session] ERROR: No session ID`);
        return "Failed to distill: current session ID is unavailable.";
      }

      // Handle cancel action
      if (args.action === "cancel") {
        debugLog(`[distill_session] ACTION: cancel - clearing pending confirmation`);
        clearPendingConfirmation(sessionID);
        debugLog(`[distill_session] ========== TOOL END (cancel) ==========`);
        return "❌ Distillation cancelled. Candidates discarded.";
      }

      // Handle confirm action with deduplication
      if (args.action === "confirm") {
        debugLog(`[distill_session] ACTION: confirm - checking pending candidates`);
        const pending = getPendingConfirmation(sessionID);
        if (!pending) {
          debugLog(`[distill_session] ERROR: No pending candidates`);
          debugLog(`[distill_session] ========== TOOL END (confirm - no pending) ==========`);
          return "⚠️ No pending candidates to confirm. Run with action='preview' first.";
        }

        debugLog(`[distill_session] Found ${pending.candidates.length} pending candidates`);

        // Filter candidates if selectedIndices provided
        let candidatesToWrite = pending.candidates;
        if (args.selectedIndices && args.selectedIndices.length > 0) {
          candidatesToWrite = args.selectedIndices
            .filter(i => i >= 0 && i < pending.candidates.length)
            .map(i => pending.candidates[i]);
          debugLog(`[distill_session] Filtered to ${candidatesToWrite.length} candidates by selectedIndices`);
          if (candidatesToWrite.length === 0) {
            debugLog(`[distill_session] ERROR: No valid candidates after filtering`);
            debugLog(`[distill_session] ========== TOOL END (confirm - invalid indices) ==========`);
            return "⚠️ No valid candidates selected.";
          }
        }

        // Execute deduplication and write
        debugLog(`[distill_session] Executing confirmCandidates...`);
        const confirmStart = Date.now();
        const result = await distillEngine.confirmCandidates(
          sessionID,
          candidatesToWrite,
          "wopal-space"
        );
        debugLog(`[distill_session] confirmCandidates DONE: ${Date.now() - confirmStart}ms`);
        debugLog(`[distill_session] Result: created=${result.created}, merged=${result.merged}, skipped=${result.skipped}`);

        // Update session title if generated
        if (pending.title && typeof client?.session?.update === "function") {
          try {
            debugLog(`[distill_session] Updating session title: ${pending.title}`);
            await client.session.update({
              path: { id: sessionID },
              body: { title: pending.title },
            });
            debugLog(`[distill_session] Session title updated`);
          } catch (error) {
            debugLog(`[distill_session] Failed to update session title: ${error}`);
          }
        }

        clearPendingConfirmation(sessionID);
        debugLog(`[distill_session] ========== TOOL END (confirm) ==========`);
        return formatConfirmReportWithDedup(candidatesToWrite, pending.title, result);
      }

      // Handle preview action
      if (args.action === "preview") {
        debugLog(`[distill_session] ACTION: preview`);
        // If force=true, clear existing extraction state
        if (args.force) {
          clearExtractionState(sessionID);
          clearPendingConfirmation(sessionID);
          debugLog(`[distill_session] Force mode: cleared extraction state`);
        }

        // Fetch session messages via client SDK
        try {
          if (typeof client?.session?.messages !== "function") {
            debugLog(`[distill_session] ERROR: session.messages API unavailable`);
            debugLog(`[distill_session] ========== TOOL END (preview - no API) ==========`);
            return "Failed to distill: session.messages API is unavailable.";
          }

          debugLog(`[distill_session] Fetching session messages...`);
          const fetchStart = Date.now();
          const result = await client.session.messages({
            path: { id: sessionID },
          });
          debugLog(`[distill_session] Fetched messages in ${Date.now() - fetchStart}ms`);

          const messages: SessionMessage[] = result?.data ?? [];
          debugLog(`[distill_session] Message count: ${messages.length}`);

          // Log message stats
          const roleStats: Record<string, number> = { user: 0, assistant: 0, other: 0 };
          const partTypeStats: Record<string, number> = {};
          for (const msg of messages) {
            const role = msg.info?.role ?? "other";
            roleStats[role] = (roleStats[role] ?? 0) + 1;
            if (msg.parts) {
              for (const part of msg.parts) {
                const partType = part.type ?? "unknown";
                partTypeStats[partType] = (partTypeStats[partType] ?? 0) + 1;
              }
            }
          }
          debugLog(`[distill_session] Role stats: ${JSON.stringify(roleStats)}`);
          debugLog(`[distill_session] Part type stats: ${JSON.stringify(partTypeStats)}`);

          if (messages.length === 0) {
            debugLog(`[distill_session] No messages to distill`);
            debugLog(`[distill_session] ========== TOOL END (preview - no messages) ==========`);
            return "No messages in current session to distill.";
          }

          // Run preview (extract without writing)
          debugLog(`[distill_session] Running distillEngine.preview...`);
          const previewStart = Date.now();
          const previewResult = await distillEngine.preview(sessionID, messages);
          debugLog(`[distill_session] Preview DONE in ${Date.now() - previewStart}ms`);
          debugLog(`[distill_session] Preview result: ${previewResult.candidates.length} candidates, title=${previewResult.title ?? "none"}`);

          if (previewResult.candidates.length === 0) {
            debugLog(`[distill_session] ========== TOOL END (preview - no candidates) ==========`);
            return "No memories extracted from this session. The conversation may be too short or contain no long-term valuable information.";
          }

          // Store pending confirmation
          setPendingConfirmation(sessionID, previewResult);

          // Format preview report
          debugLog(`[distill_session] ========== TOOL END (preview - success) ==========`);
          return formatPreviewReport(previewResult.candidates, previewResult.title, messages.length);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          debugLog(`[distill_session] ERROR: ${message}`);
          debugLog(`[distill_session] Stack: ${error instanceof Error ? error.stack : "N/A"}`);
          debugLog(`[distill_session] ========== TOOL END (preview - error) ==========`);
          return `Distillation preview failed: ${message}`;
        }
      }

      debugLog(`[distill_session] ERROR: Unknown action '${args.action}'`);
      return "Unknown action.";
    },
  });
}

/**
 * Format preview report for user review
 */
function formatPreviewReport(
  candidates: PreviewCandidate[],
  title: string | null,
  messageCount: number
): string {
  const lines: string[] = [];

  lines.push("## 🔍 Distillation Preview");
  lines.push("");
  lines.push(`**Session Messages:** ${messageCount}`);
  lines.push(`**Candidates Found:** ${candidates.length}`);

  if (title) {
    lines.push(`**Suggested Title:** ${title}`);
  }

  lines.push("");
  lines.push("### Candidate Memories");
  lines.push("");

  candidates.forEach((candidate, index) => {
    lines.push(`**[${index}] ${candidate.body.split("\n")[0]}**`);
    // Show full body content (without the title line)
    const bodyContent = candidate.body.slice(candidate.body.indexOf("\n") + 1);
    if (bodyContent) {
      // Preserve line breaks for readability, indent each line
      const indentedBody = bodyContent.split('\n').map(line => line ? `   ${line}` : '   ').join('\n');
      lines.push(indentedBody);
    }
    lines.push(`   Category: \`${candidate.category}\` | Importance: ${candidate.importance}/10 | Concepts: ${candidate.concepts.join(", ") || "none"}`);
    lines.push("");
  });

  lines.push("---");
  lines.push("");
  lines.push("**Next Steps:**");
  lines.push("- To write all candidates: `/distill action=confirm`");
  lines.push("- To write specific candidates: `/distill action=confirm selectedIndices=[0,2,5]`");
  lines.push("- To cancel: `/distill action=cancel`");

  return lines.join("\n");
}

/**
 * Format confirm report with deduplication results
 */
function formatConfirmReportWithDedup(
  selected: PreviewCandidate[],
  title: string | null,
  result: { created: number; merged: number; skipped: number }
): string {
  const lines: string[] = [];

  lines.push("## ✅ Distillation Complete (with Deduplication)");
  lines.push("");
  lines.push(`**Selected:** ${selected.length} | **Created:** ${result.created} | **Merged:** ${result.merged} | **Skipped:** ${result.skipped}`);

  if (title) {
    lines.push(`**Session Title:** ${title}`);
  }

  lines.push("");
  lines.push("### Selected Candidates");
  selected.forEach((m, i) => {
    lines.push(`${i + 1}. [${m.category}] ${m.body.split("\n")[0]}`);
  });

  if (result.skipped > 0) {
    lines.push("");
    lines.push(`> ℹ️ ${result.skipped} candidate(s) skipped as duplicates`);
  }
  if (result.merged > 0) {
    lines.push(`> ℹ️ ${result.merged} candidate(s) merged with existing memories`);
  }

  return lines.join("\n");
}

