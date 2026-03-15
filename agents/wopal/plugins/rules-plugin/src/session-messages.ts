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
