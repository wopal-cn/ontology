import { tool, type ToolDefinition, type ToolContext } from "@opencode-ai/plugin"
import type { SimpleTaskManager } from "../simple-task-manager.js"

const REPORT_TEMPLATE = `

---
[MANDATORY - Include this report at the end of your response]

## Task Report
**Summary**: <1-2 sentences describing what you did>
**Files**: <List all created/modified files with full paths>
**Commands**: <List any commands you executed>
**Issues**: <Any problems, or "None">
**Status**: COMPLETED | FAILED
---`

export function createWopalTaskTool(manager: SimpleTaskManager): ToolDefinition {
  return tool({
    description: "Launch a non-blocking background task with a subagent",
    args: {
      description: tool.schema.string().describe("Short description of the task (3-5 words)"),
      prompt: tool.schema.string().describe("Detailed instructions for the subagent"),
      agent: tool.schema.string().optional().default("general").describe("Agent type: 'general', 'explore', 'code-quality-reviewer', etc."),
      timeout: tool.schema.number().min(10).max(3600).optional().describe("Timeout in seconds (default: 300, max: 3600)"),
      staleTimeout: tool.schema.number().min(30).max(1800).optional().describe("Stale timeout in seconds - interrupt if no activity (default: 180, max: 1800)"),
    },
    execute: async (args, context: ToolContext) => {
      if (!context.sessionID) {
        return "Failed to launch task: current session ID is unavailable."
      }

      // Handle default for agent (schema default may be bypassed in direct calls)
      const agent = args.agent ?? "general"
      const fullPrompt = args.prompt + REPORT_TEMPLATE
      const result = await manager.launch({
        description: args.description,
        prompt: fullPrompt,
        agent,
        parentSessionID: context.sessionID,
        ...(args.timeout !== undefined ? { timeout: args.timeout } : {}),
        ...(args.staleTimeout !== undefined ? { staleTimeout: args.staleTimeout } : {}),
      })

      if (!result.ok) {
        const taskLine = result.taskId ? `Task: ${result.taskId}\n` : ""
        return `Failed to launch task.\n${taskLine}Reason: ${result.error}`
      }

      const timeoutInfo = args.timeout ? ` timeout: ${args.timeout}s` : ""
      const staleInfo = args.staleTimeout ? ` stale: ${args.staleTimeout}s` : ""
      const infoParts = [timeoutInfo, staleInfo].filter(Boolean).join(",")
      const infoStr = infoParts ? ` (${infoParts})` : ""
      return `Task launched: ${result.taskId}\nStatus: ${result.status}${infoStr}\n\nUse \`wopal_output(task_id="${result.taskId}")\` to check task status and retrieve results.`
    },
  })
}
