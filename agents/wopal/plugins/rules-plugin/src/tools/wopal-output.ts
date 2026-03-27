import { tool, type ToolContext, type ToolDefinition } from "@opencode-ai/plugin"
import type { SimpleTaskManager } from "../simple-task-manager.js"
import { getErrorMessage, extractMessages, extractAssistantContent, extractBySection, type OutputSection } from "../session-messages.js"
import { consumeNewMessages } from "../session-cursor.js"
import { analyzeProgress, type ProgressInfo } from "../progress-analyzer.js"
import { detectLoop, type LoopWarning } from "../loop-detector.js"
import { createDebugLog } from "../debug.js"

const debugLog = createDebugLog("[wopal-task]", "task")
const MAX_RECENT_OUTPUT = 800

/**
 * Truncate text to max length, adding truncation indicator if needed.
 */
function truncateOutput(text: string): string {
  if (text.length <= MAX_RECENT_OUTPUT) return text
  return text.slice(-MAX_RECENT_OUTPUT) + "\n[...earlier content truncated]"
}

/**
 * Format progress information for display.
 */
function formatProgressOutput(
  progress: ProgressInfo,
  loopWarning: LoopWarning | null,
  sessionStatus: string,
  recentOutput: string | null
): string {
  let result = `\n\n**Progress:**`
  result += `\n- Session: ${sessionStatus}`
  result += `\n- Messages: ${progress.totalMessages} total, ${progress.newMessages} new since last check`

  if (progress.toolCalls.length > 0) {
    const toolSummary = progress.toolCalls
      .slice(0, 5)
      .map((t) => `${t.tool}: ${t.count}`)
      .join(", ")
    result += `\n- Tool calls: ${toolSummary}`
  }

  if (progress.lastActivityMs > 0) {
    const seconds = Math.floor(progress.lastActivityMs / 1000)
    if (seconds < 60) {
      result += `\n- Last activity: ${seconds} second${seconds !== 1 ? "s" : ""} ago`
    } else {
      const minutes = Math.floor(seconds / 60)
      result += `\n- Last activity: ${minutes} minute${minutes !== 1 ? "s" : ""} ago`
    }
  }

  if (loopWarning) {
    const severityIcon = loopWarning.severity === "critical" ? "!!" : "!"
    result += `\n\n${severityIcon} **Warning**: ${loopWarning.message}`
  }

  if (recentOutput) {
    result += `\n\n---\n**Recent output:**\n${truncateOutput(recentOutput)}`
  }

  return result
}

export function createWopalOutputTool(manager: SimpleTaskManager): ToolDefinition {
  return tool({
    description: "Get lifecycle status for a background task owned by the current session. Use `section` to retrieve specific content types: 'tools' for tool calls/results (check progress), 'reasoning' for thinking process (diagnose stuck), 'text' for text output (get results). Without section, returns a lightweight summary.",
    args: {
      task_id: tool.schema.string().describe("Task ID returned by wopal_task"),
      section: tool.schema.enum(["tools", "reasoning", "text"]).optional().describe("Content section to retrieve: 'tools' (tool calls & results), 'reasoning' (thinking process), 'text' (text output). Omit for summary only."),
      last_n: tool.schema.number().optional().describe("Only output the last N messages. Default: all messages."),
    },
    execute: async (args: { task_id: string; section?: OutputSection; last_n?: number }, context: ToolContext) => {
      if (!context.sessionID) {
        return "Current session ID is unavailable; cannot read task status."
      }

      const { task_id, section, last_n } = args

      const task = manager.getTaskForParent(task_id, context.sessionID)

      if (!task) {
        return `Task not found for current session: ${task_id}`
      }

      let result = `**Task:** ${task.id}\n`
      result += `**Status:** ${task.status}\n`
      result += `**Description:** ${task.description}\n`
      result += `**Agent:** ${task.agent}\n`

      if (task.status === 'completed' && task.sessionID) {
        result += `\nTask completed at ${task.completedAt?.toISOString()}`

        // Fetch and extract subagent output
        const client = manager.getClient()
        if (typeof client.session?.messages === "function") {
          try {
            const messagesResult = await client.session.messages({
              path: { id: task.sessionID },
            })

            const error = getErrorMessage(messagesResult)
            if (error) {
              result += `\n\n---\n\nError fetching result: ${error}`
            } else {
              const messages = extractMessages(messagesResult)
              const newMessages = consumeNewMessages(task.sessionID, messages)
              const content = extractAssistantContent(newMessages)

              if (newMessages.length === 0) {
                result += `\n\n---\n\n(No new output since last check)`
              } else {
                result += `\n\n---\n\n${content || "(No text output)"}`
              }
            }
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err)
            result += `\n\n---\n\nError fetching result: ${errorMsg}`
          }
        } else {
          result += `\n\n---\n\n(Result extraction unavailable: session.messages not supported)`
        }
      } else if (task.status === 'error') {
        result += `\nError: ${task.error}`

        // 获取消息内容以便诊断失败原因
        if (task.sessionID) {
          const client = manager.getClient()
          if (typeof client.session?.messages === "function") {
            try {
              const messagesResult = await client.session.messages({
                path: { id: task.sessionID },
              })
              const error = getErrorMessage(messagesResult)
              if (!error) {
                const messages = extractMessages(messagesResult)
                const content = extractAssistantContent(messages)
                if (content) {
                  result += `\n\n---\n**Last output:**\n${content}`
                }
              }
            } catch {
              // 忽略错误，保留基本信息
            }
          }
        }
      } else if (task.status === 'running' && task.sessionID) {
        // Enhanced: fetch messages and analyze progress
        const client = manager.getClient()

        // Try to get session status (may not be available)
        let sessionStatus = "unknown"
        try {
          if (typeof client.session?.status === "function") {
            debugLog(`[progress] fetching session status for ${task.sessionID}`)
            const statusResult = await client.session.status()
            if (statusResult && typeof statusResult === "object") {
              const statusData = statusResult as Record<string, { type?: string }>
              sessionStatus = statusData[task.sessionID]?.type ?? "unknown"
            }
          }
        } catch {
          // Graceful degradation: session status not available
          debugLog(`[progress] session.status not available, using unknown`)
        }

        // Fetch messages for progress analysis
        if (typeof client.session?.messages === "function") {
          try {
            debugLog(`[progress] fetching messages for taskId=${task.id}`)
            const messagesResult = await client.session.messages({
              path: { id: task.sessionID },
            })

            const error = getErrorMessage(messagesResult)
            if (error) {
              result += `\n\n**Progress:** Unable to fetch (error: ${error})`
              result += `\nTask is still running.`
            } else {
              const messages = extractMessages(messagesResult)
              const newMessages = consumeNewMessages(task.sessionID, messages)

              const progress = analyzeProgress(messages, newMessages)
              const loopWarning = detectLoop(messages)
              const recentOutput = extractAssistantContent(newMessages) || null

              result += formatProgressOutput(progress, loopWarning, sessionStatus, recentOutput)
            }
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err)
            debugLog(`[progress] error fetching messages: ${errorMsg}`)
            result += `\n\n**Progress:** Unable to fetch (error: ${errorMsg})`
            result += `\nTask is still running.`
          }
        } else {
          result += `\nTask is still running.`
        }
      } else if (task.status === 'running') {
        result += `\nTask is still running.`
      } else if (task.status === 'waiting' && task.sessionID) {
        // waiting 状态显示等待原因
        if (task.waitingReason) {
          result += `\n**Waiting reason:** ${task.waitingReason}`
        }

        // waiting 状态：如果指定了 section 则按分类获取，否则用 section="text" 获取文本内容
        const fetchSection = section ?? "text"
        const client = manager.getClient()
        if (typeof client.session?.messages === "function") {
          try {
            debugLog(`[section] fetching section="${fetchSection}" for waiting task ${task.id}`)
            const messagesResult = await client.session.messages({
              path: { id: task.sessionID },
            })

            const error = getErrorMessage(messagesResult)
            if (error) {
              result += `\n\n---\n**Section [${fetchSection}]:**\n(Failed to fetch: ${error})`
            } else {
              const messages = extractMessages(messagesResult)
              const sectionContent = extractBySection(messages, fetchSection, last_n ? { lastN: last_n } : undefined)
              result += `\n\n---\n**Section [${fetchSection}]:**\n${sectionContent || "(No content)"}`
            }
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err)
            result += `\n\n---\n**Section [${fetchSection}]:**\n(Failed to fetch: ${errorMsg})`
          }
        }
      } else if (task.status === 'waiting') {
        result += `\nTask is waiting.`
        if (task.waitingReason) {
          result += `\n**Waiting reason:** ${task.waitingReason}`
        }
      } else if (task.status === 'cancelled') {
        result += `\nTask was cancelled at ${task.completedAt?.toISOString()}`
      }

      // section 模式：按分类获取内容
      const shouldShowSection = section && task.status !== 'waiting' && task.sessionID
      if (shouldShowSection) {
        const client = manager.getClient()
        if (typeof client.session?.messages === "function") {
          try {
            debugLog(`[section] fetching section="${section}" for task ${task.id}`)
            const messagesResult = await client.session.messages({
              path: { id: task.sessionID },
            })

            const error = getErrorMessage(messagesResult)
            if (error) {
              result += `\n\n---\n**Section [${section}]:**\n(Failed to fetch: ${error})`
            } else {
              const messages = extractMessages(messagesResult)
              const sectionContent = extractBySection(messages, section, last_n ? { lastN: last_n } : undefined)
              result += `\n\n---\n**Section [${section}]:**\n${sectionContent || "(No content)"}`
            }
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err)
            result += `\n\n---\n**Section [${section}]:**\n(Failed to fetch: ${errorMsg})`
          }
        }
      }

      return result
    },
  })
}
