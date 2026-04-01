import { describe, it, expect } from "vitest"
import { getErrorMessage, extractMessages, extractAssistantContent, extractFullHistory } from "./session-messages.js"
import type { SessionMessage, MessagesResult } from "./types.js"

describe("getErrorMessage", () => {
  it("returns null for array input", () => {
    expect(getErrorMessage([] as unknown as MessagesResult)).toBeNull()
  })

  it("returns null for undefined error", () => {
    expect(getErrorMessage({ error: undefined })).toBeNull()
  })

  it("returns null for null error", () => {
    expect(getErrorMessage({ error: null })).toBeNull()
  })

  it("returns string error as-is", () => {
    expect(getErrorMessage({ error: "Something went wrong" })).toBe("Something went wrong")
  })

  it("returns empty string error as string", () => {
    expect(getErrorMessage({ error: "" })).toBe("")
  })

  it("converts non-string error to string", () => {
    expect(getErrorMessage({ error: { code: 500 } })).toBe("[object Object]")
  })
})

describe("extractMessages", () => {
  it("returns empty array for empty input", () => {
    expect(extractMessages({})).toEqual([])
  })

  it("extracts from data array", () => {
    const messages: SessionMessage[] = [
      { id: "1", info: { role: "user" } },
      { id: "2", info: { role: "assistant" } },
    ]
    expect(extractMessages({ data: messages })).toEqual(messages)
  })

  it("extracts from direct array", () => {
    const messages: SessionMessage[] = [
      { id: "1", info: { role: "user" } },
    ]
    expect(extractMessages(messages as unknown as MessagesResult)).toEqual(messages)
  })

  it("filters non-message items", () => {
    const input = [null, { id: "1" }, undefined, "string"] as unknown as MessagesResult
    expect(extractMessages(input)).toEqual([{ id: "1" }])
  })
})

describe("extractAssistantContent", () => {
  it("returns empty string for empty input", () => {
    expect(extractAssistantContent([])).toBe("")
  })

  it("extracts text from assistant messages", () => {
    const messages: SessionMessage[] = [
      {
        info: { role: "assistant" },
        parts: [{ type: "text", text: "Hello, world!" }],
      },
    ]
    expect(extractAssistantContent(messages)).toBe("Hello, world!")
  })

  it("extracts reasoning content", () => {
    const messages: SessionMessage[] = [
      {
        info: { role: "assistant" },
        parts: [{ type: "reasoning", text: "Thinking..." }],
      },
    ]
    expect(extractAssistantContent(messages)).toBe("Thinking...")
  })

  it("extracts tool_result with string content", () => {
    const messages: SessionMessage[] = [
      {
        info: { role: "tool" },
        parts: [{ type: "tool_result", content: "Tool output" }],
      },
    ]
    expect(extractAssistantContent(messages)).toBe("Tool output")
  })

  it("extracts tool_result with array content", () => {
    const messages: SessionMessage[] = [
      {
        info: { role: "tool" },
        parts: [
          {
            type: "tool_result",
            content: [
              { type: "text", text: "Line 1" },
              { type: "text", text: "Line 2" },
            ],
          },
        ],
      },
    ]
    expect(extractAssistantContent(messages)).toBe("Line 1\n\nLine 2")
  })

  it("ignores user messages", () => {
    const messages: SessionMessage[] = [
      {
        info: { role: "user" },
        parts: [{ type: "text", text: "User input" }],
      },
      {
        info: { role: "assistant" },
        parts: [{ type: "text", text: "Assistant response" }],
      },
    ]
    expect(extractAssistantContent(messages)).toBe("Assistant response")
  })

  it("joins multiple messages with double newline", () => {
    const messages: SessionMessage[] = [
      {
        info: { role: "assistant" },
        parts: [{ type: "text", text: "First message" }],
      },
      {
        info: { role: "tool" },
        parts: [{ type: "tool_result", content: "Tool result" }],
      },
    ]
    expect(extractAssistantContent(messages)).toBe("First message\n\nTool result")
  })

  it("filters empty text parts", () => {
    const messages: SessionMessage[] = [
      {
        info: { role: "assistant" },
        parts: [
          { type: "text", text: "" },
          { type: "text", text: "Non-empty" },
        ],
      },
    ]
    expect(extractAssistantContent(messages)).toBe("Non-empty")
  })
})
