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

function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`
  return String(n)
}

interface TaskModelInfo {
  providerID: string
  modelID: string
}

async function getTaskModelInfo(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  sessionID: string,
): Promise<TaskModelInfo | null> {
  try {
    if (typeof client.session?.messages !== "function") return null
    const messagesResult = await client.session.messages({
      path: { id: sessionID },
      query: { limit: 1 }
    })
    const messages = messagesResult?.data ?? []

    // 找最后一条 assistant 消息获取模型信息
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lastAssistant = [...messages].reverse().find((m: any) =>
      m?.info?.role === "assistant"
    )
    if (!lastAssistant?.info) return null

    const providerID = lastAssistant.info.providerID ?? lastAssistant.info.model?.providerID
    const modelID = lastAssistant.info.modelID ?? lastAssistant.info.model?.modelID
    if (!providerID || !modelID) return null

    return { providerID, modelID }
  } catch (err) {
    debugLog(`[modelInfo] error: ${err instanceof Error ? err.message : String(err)}`)
    return null
  }
}

async function getContextUsage(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  sessionID: string,
  directory: string,
): Promise<string | null> {
  try {
    if (typeof client.session?.messages !== "function") return null
    const messagesResult = await client.session.messages({
      path: { id: sessionID },
    })
    const messages = messagesResult?.data ?? []

    // 找最后一条 assistant 消息（含 tokens 字段）
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lastAssistant = [...messages].reverse().find((m: any) =>
      m?.info?.role === "assistant" && m?.info?.tokens
    )
    if (!lastAssistant?.info?.tokens) return null

    const tokens = lastAssistant.info.tokens
    const used = (tokens.input ?? 0) + (tokens.cache?.read ?? 0)
    if (used === 0) return null

    // 获取 model context limit
    if (typeof client.config?.providers !== "function") return null
    const providersResult = await client.config.providers({
      query: { directory },
    })
    const providers = providersResult?.data?.providers ?? []
    const providerID = lastAssistant.info.providerID ?? lastAssistant.info.model?.providerID
    const modelID = lastAssistant.info.modelID ?? lastAssistant.info.model?.modelID
    if (!providerID || !modelID) return null

    const provider = providers.find((p: { id: string }) => p.id === providerID)
    const contextLimit = provider?.models?.[modelID]?.limit?.context
    if (!contextLimit) return null

    const pct = Math.round((used / contextLimit) * 100)
    const warn = pct > 45 ? " ⚠️" : ""
    return `Context: ${pct}% used (${formatTokenCount(used)}/${formatTokenCount(contextLimit)})${warn}`
  } catch (err) {
    debugLog(`[contextUsage] error: ${err instanceof Error ? err.message : String(err)}`)
    return null
  }
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
    description: "Get status and output for a background task. Use `section` param: 'tools' (tool calls), 'reasoning' (thinking), 'text' (output). Omit for summary.",
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
      const statusDisplay = task.idleNotified ? 'idle (awaiting judgment)' : task.status
      result += `**Status:** ${statusDisplay}\n`
      result += `**Description:** ${task.description}\n`
      result += `**Agent:** ${task.agent}\n`

      // 获取模型信息（仅当有 sessionID 时）
      if (task.sessionID) {
        const client = manager.getClient()
        const modelInfo = await getTaskModelInfo(client, task.sessionID)
        if (modelInfo) {
          result += `**Model:** ${modelInfo.providerID}/${modelInfo.modelID}\n`
        }
      }

      // 并发槽位状态
      const concurrency = manager.getConcurrencyStatus()
      result += `**Concurrency:** ${concurrency.used}/${concurrency.limit} used, ${concurrency.available} available\n`

      // idle task: awaiting Wopal judgment
      if (task.idleNotified) {
        result += `\n\n**Idle:** awaiting your judgment`
        result += `\nUse wopal_task_reply to redirect, or wopal_task_interrupt to abort current execution.`
      }

      if (task.status === 'error') {
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
              const contextUsage = await getContextUsage(client, task.sessionID!, manager.getDirectory())

              result += formatProgressOutput(progress, loopWarning, sessionStatus, recentOutput)
              if (contextUsage) {
                result += `\n- ${contextUsage}`
              }
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
