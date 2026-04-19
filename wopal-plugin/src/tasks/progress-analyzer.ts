import type { SessionMessage } from "../types.js"
import { createDebugLog } from "../debug.js"

const debugLog = createDebugLog("[wopal-task]", "task")

export interface ProgressInfo {
  totalMessages: number
  newMessages: number
  toolCalls: Array<{ tool: string; count: number }>
  lastActivityMs: number
  hasAssistantText: boolean
  finishReason?: string
}

/**
 * Get timestamp from a message's time field.
 * Returns milliseconds since epoch, or 0 if unavailable.
 */
function getMessageTime(message: SessionMessage): number {
  const time = message.info?.time
  if (!time) return 0

  if (typeof time === "string") {
    const parsed = Date.parse(time)
    return isNaN(parsed) ? 0 : parsed
  }

  return time.created ?? 0
}

/**
 * Count tool calls from message parts.
 * OpenCode uses part.type === "tool" with part.tool containing the tool name.
 */
function countToolCalls(messages: SessionMessage[]): Map<string, number> {
  const toolCounts = new Map<string, number>()

  for (const message of messages) {
    if (message.info?.role !== "assistant") continue

    for (const part of message.parts ?? []) {
      if (part.type === "tool") {
        const toolName = part.tool ?? "unknown"
        const current = toolCounts.get(toolName) ?? 0
        toolCounts.set(toolName, current + 1)
      }
    }
  }

  return toolCounts
}

/**
 * Check if messages contain any assistant text content.
 */
function hasAssistantTextContent(messages: SessionMessage[]): boolean {
  for (const message of messages) {
    if (message.info?.role !== "assistant") continue

    for (const part of message.parts ?? []) {
      if ((part.type === "text" || part.type === "reasoning") && part.text?.trim()) {
        return true
      }
    }
  }
  return false
}

/**
 * Get the finish reason from the last assistant message.
 */
function getFinishReason(messages: SessionMessage[]): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (message.info?.role === "assistant") {
      return message.info?.finish
    }
  }
  return undefined
}

/**
 * Analyze progress information from session messages.
 * 
 * @param allMessages - All messages in the session
 * @param newMessages - Messages since last check
 * @returns Progress information including counts, tool calls, and activity
 */
export function analyzeProgress(
  allMessages: SessionMessage[],
  newMessages: SessionMessage[]
): ProgressInfo {
  const toolCounts = countToolCalls(allMessages)
  const toolCalls = Array.from(toolCounts.entries())
    .map(([tool, count]) => ({ tool, count }))
    .sort((a, b) => b.count - a.count)

  // Calculate last activity time
  let lastActivityTime = 0
  for (const message of allMessages) {
    const msgTime = getMessageTime(message)
    if (msgTime > lastActivityTime) {
      lastActivityTime = msgTime
    }
  }

  const now = Date.now()
  const lastActivityMs = lastActivityTime > 0 ? now - lastActivityTime : 0

  const hasAssistantText = hasAssistantTextContent(allMessages)
  const finishReason = getFinishReason(allMessages)

  const info: ProgressInfo = {
    totalMessages: allMessages.length,
    newMessages: newMessages.length,
    toolCalls,
    lastActivityMs,
    hasAssistantText,
    ...(finishReason !== undefined ? { finishReason } : {}),
  }

  const toolSummary = toolCalls.length > 0
    ? `, tools: ${toolCalls.map(t => `${t.tool}×${t.count}`).join(', ')}`
    : ''
  debugLog(`[progress] ${allMessages.length} msgs (+${newMessages.length})${toolSummary}`)

  return info
}
