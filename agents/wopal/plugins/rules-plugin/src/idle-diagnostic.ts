import type { SessionMessage } from "./types.js"
import { createDebugLog } from "./debug.js"

const debugLog = createDebugLog("[wopal-task]", "task")

export interface IdleDiagnostic {
  verdict: "completed" | "waiting" | "error"
  reason: string
  lastMessage?: string
}

/**
 * Detect if text contains question patterns.
 * Matches both Chinese and English question patterns.
 */
export function detectQuestionPattern(text: string): boolean {
  if (!text || text.trim().length === 0) {
    return false
  }

  const trimmedText = text.trim()

  // Check for question marks at the end (excluding URL ?)
  // Find ? or ? that are not part of a URL
  const questionMarkMatch = /[？?]/
  const match = trimmedText.match(questionMarkMatch)
  if (match && match.index !== undefined) {
    // Check if the ? is part of a URL
    const beforeQuestion = trimmedText.slice(0, match.index)
    const isUrlQuestion = /https?:\/\/[^?\s]*$/.test(beforeQuestion) || /\/[^?\s]*$/.test(beforeQuestion)
    if (!isUrlQuestion) {
      return true
    }
  }

  // Chinese question keywords
  const chinesePatterns = [
    /应该/,
    /如何/,
    /是否/,
    /要不要/,
    /需要.*吗/,
    /请确认/,
    /请选择/,
  ]

  for (const pattern of chinesePatterns) {
    if (pattern.test(trimmedText)) {
      return true
    }
  }

  // Numbered option pattern: 1) xxx\n2) xxx or 1. xxx\n2. xxx
  const numberedOptionPattern = /\d[).]\s*.+\n\s*\d[).]\s*.+/
  if (numberedOptionPattern.test(trimmedText)) {
    return true
  }

  // Letter option pattern: A. xxx\nB. xxx
  const letterOptionPattern = /[A-Z][).]\s*.+\n\s*[A-Z][).]\s*.+/
  if (letterOptionPattern.test(trimmedText)) {
    return true
  }

  return false
}

/**
 * Extract text content from an assistant message.
 */
function extractAssistantText(message: SessionMessage): string {
  const texts: string[] = []

  for (const part of message.parts ?? []) {
    if ((part.type === "text" || part.type === "reasoning") && part.text) {
      texts.push(part.text)
    }
  }

  return texts.join(" ").trim()
}

/**
 * Get the last assistant message from a list of messages.
 */
function getLastAssistantMessage(messages: SessionMessage[]): SessionMessage | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].info?.role === "assistant") {
      return messages[i]
    }
  }
  return undefined
}

/**
 * Get finish reason from a message.
 */
function getFinishReason(message: SessionMessage): string | undefined {
  return message.info?.finish
}

/**
 * Diagnose the idle state based on session messages.
 *
 * @param messages - Session messages to analyze
 * @returns Diagnostic result with verdict, reason, and optional last message
 */
export function diagnoseIdle(messages: SessionMessage[]): IdleDiagnostic {
  debugLog(`[diagnoseIdle] analyzing ${messages.length} messages`)

  // 1. Empty messages or no assistant message
  if (!messages || messages.length === 0) {
    debugLog(`[diagnoseIdle] no messages, verdict: error, reason: no_response`)
    return { verdict: "error", reason: "no_response" }
  }

  const lastAssistant = getLastAssistantMessage(messages)
  if (!lastAssistant) {
    debugLog(`[diagnoseIdle] no assistant message, verdict: error, reason: no_response`)
    return { verdict: "error", reason: "no_response" }
  }

  const finishReason = getFinishReason(lastAssistant)
  const text = extractAssistantText(lastAssistant)

  debugLog(`[diagnoseIdle] finish_reason: ${finishReason ?? "undefined"}, text length: ${text.length}`)

  // 2. Analyze based on finish_reason
  if (finishReason === "stop") {
    const hasQuestion = detectQuestionPattern(text)
    if (hasQuestion) {
      debugLog(`[diagnoseIdle] stop + question, verdict: waiting, reason: question_detected`)
      return { verdict: "waiting", reason: "question_detected", lastMessage: text }
    }
    debugLog(`[diagnoseIdle] stop + no question, verdict: completed, reason: normal_completion`)
    return { verdict: "completed", reason: "normal_completion", lastMessage: text }
  }

  if (finishReason === "length") {
    debugLog(`[diagnoseIdle] finish_reason: length, verdict: error, reason: finish_length`)
    return { verdict: "error", reason: "finish_length" }
  }

  if (finishReason === "content_filter") {
    debugLog(`[diagnoseIdle] finish_reason: content_filter, verdict: error, reason: finish_content_filter`)
    return { verdict: "error", reason: "finish_content_filter" }
  }

  // No finish_reason
  if (text.length > 0) {
    const hasQuestion = detectQuestionPattern(text)
    if (!hasQuestion) {
      debugLog(`[diagnoseIdle] no finish_reason + text + no question, verdict: completed, reason: normal_completion`)
      return { verdict: "completed", reason: "normal_completion", lastMessage: text }
    }
    // Has question but no finish_reason - still waiting
    debugLog(`[diagnoseIdle] no finish_reason + question, verdict: waiting, reason: question_detected`)
    return { verdict: "waiting", reason: "question_detected", lastMessage: text }
  }

  // No finish_reason and no text
  debugLog(`[diagnoseIdle] no finish_reason + no text, verdict: error, reason: no_response`)
  return { verdict: "error", reason: "no_response" }
}

/**
 * Build a summary of recent tool calls from messages.
 *
 * @param messages - Session messages to analyze
 * @param maxLength - Maximum length of the summary (default 800)
 * @returns Formatted tool call summary
 */
export function buildContextSummary(messages: SessionMessage[], maxLength = 800): string {
  const toolCalls: Array<{ tool: string; args?: string }> = []

  for (const message of messages) {
    if (message.info?.role !== "assistant") continue

    for (const part of message.parts ?? []) {
      if (part.type === "tool" && part.tool) {
        toolCalls.push({ tool: part.tool })
      }
    }
  }

  if (toolCalls.length === 0) {
    // No tool calls, try to extract last assistant text
    const lastAssistant = getLastAssistantMessage(messages)
    if (lastAssistant) {
      const text = extractAssistantText(lastAssistant)
      if (text.length > maxLength) {
        return text.slice(0, maxLength) + "..."
      }
      return text
    }
    return ""
  }

  // Format tool calls
  const lines: string[] = []
  for (let i = 0; i < toolCalls.length; i++) {
    const tc = toolCalls[i]
    if (tc.args) {
      lines.push(`${i + 1}. ${tc.tool}(${tc.args})`)
    } else {
      lines.push(`${i + 1}. ${tc.tool}()`)
    }
  }

  const summary = lines.join("\n")
  if (summary.length > maxLength) {
    return summary.slice(0, maxLength) + "..."
  }
  return summary
}