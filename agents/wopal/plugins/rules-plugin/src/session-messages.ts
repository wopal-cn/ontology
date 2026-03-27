import type { SessionMessage, MessagesResult } from "./types.js"

function isSessionMessage(value: unknown): value is SessionMessage {
  return typeof value === "object" && value !== null
}

export function getErrorMessage(value: MessagesResult): string | null {
  if (Array.isArray(value)) return null
  if (value.error === undefined || value.error === null) return null
  if (typeof value.error === "string" && value.error.length > 0) return value.error
  return String(value.error)
}

export function extractMessages(value: MessagesResult): SessionMessage[] {
  if (Array.isArray(value)) return value.filter(isSessionMessage)
  if (Array.isArray(value.data)) return value.data.filter(isSessionMessage)
  return []
}

export function extractAssistantContent(messages: SessionMessage[]): string {
  const extractedContent: string[] = []

  const relevantMessages = messages.filter(
    (m) => m.info?.role === "assistant" || m.info?.role === "tool"
  )

  for (const message of relevantMessages) {
    for (const part of message.parts ?? []) {
      if ((part.type === "text" || part.type === "reasoning") && part.text) {
        extractedContent.push(part.text)
        continue
      }

      if (part.type === "tool_result") {
        if (typeof part.content === "string" && part.content) {
          extractedContent.push(part.content)
        } else if (Array.isArray(part.content)) {
          for (const block of part.content) {
            if ((block.type === "text" || block.type === "reasoning") && block.text) {
              extractedContent.push(block.text)
            }
          }
        }
      }
    }
  }

  return extractedContent.filter((text) => text.length > 0).join("\n\n")
}

/**
 * 提取完整对话历史，格式化为可读文本
 *
 * @param messages - 会话消息列表
 * @param options - 选项 { lastN?: number, maxLength?: number }
 * @returns 格式化的对话历史文本
 */
export function extractFullHistory(
  messages: SessionMessage[],
  options?: { lastN?: number; maxLength?: number }
): string {
  if (!messages || messages.length === 0) return ""

  const maxLength = options?.maxLength ?? 4000
  const lastN = options?.lastN

  // 过滤并格式化消息
  const formatted: string[] = []
  const relevantMessages = lastN ? messages.slice(-lastN) : messages

  let turnCount = 0
  for (const msg of relevantMessages) {
    const role = msg.info?.role ?? "unknown"

    // 提取文本内容
    const texts: string[] = []
    if (msg.parts) {
      for (const part of msg.parts) {
        if (part.type === "text" && part.text) {
          texts.push(part.text)
        } else if (part.type === "tool_call" && part.tool) {
          texts.push(`[tool: ${part.tool}]`)
        } else if (part.type === "tool_result") {
          const content = typeof part.content === "string"
            ? part.content
            : part.content?.map(c => c.text).filter(Boolean).join("\n") ?? ""
          const truncated = content.length > 500
            ? content.slice(0, 500) + "...(truncated)"
            : content
          texts.push(`[tool_result]: ${truncated}`)
        } else if (part.type === "reasoning" && part.text) {
          texts.push(`[reasoning]: ${part.text}`)
        }
      }
    }

    if (texts.length > 0) {
      turnCount++
      const header = `--- Turn ${turnCount} [${role}] ---`
      formatted.push(header)
      formatted.push(...texts)
    }
  }

  let result = formatted.join("\n")

  // 截断到 maxLength
  if (result.length > maxLength) {
    result = result.slice(0, maxLength) + "\n...(earlier content truncated)"
  }

  return result
}

export type OutputSection = "tools" | "reasoning" | "text"

/**
 * Extract messages filtered by section type.
 * Each section has independent maxLength control.
 */
export function extractBySection(
  messages: SessionMessage[],
  section: OutputSection,
  options?: { lastN?: number; maxLength?: number }
): string {
  if (!messages || messages.length === 0) return ""

  const maxLength = options?.maxLength ?? 2000
  const relevantMessages = options?.lastN ? messages.slice(-options.lastN) : messages
  const extracted: string[] = []

  for (const msg of relevantMessages) {
    if (msg.info?.role !== "assistant" && msg.info?.role !== "tool") continue
    if (!msg.parts) continue

    for (const part of msg.parts) {
      if (section === "tools") {
        if (part.type === "tool_call" && part.tool) {
          extracted.push(`[tool: ${part.tool}]`)
        } else if (part.type === "tool_result") {
          const content = typeof part.content === "string"
            ? part.content
            : part.content?.map(c => c.text).filter(Boolean).join("\n") ?? ""
          const truncated = content.length > 500
            ? content.slice(0, 500) + "...(truncated)"
            : content
          extracted.push(`[result]: ${truncated}`)
        }
      } else if (section === "reasoning") {
        if (part.type === "reasoning" && part.text) {
          extracted.push(part.text)
        }
      } else if (section === "text") {
        if (part.type === "text" && part.text) {
          extracted.push(part.text)
        }
      }
    }
  }

  let result = extracted.filter(t => t.length > 0).join("\n\n")

  if (result.length > maxLength) {
    result = result.slice(-maxLength) + "\n[...earlier content truncated]"
  }

  return result
}
