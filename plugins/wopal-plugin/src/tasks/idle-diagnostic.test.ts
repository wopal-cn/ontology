import { describe, it, expect } from "vitest"
import { diagnoseIdle, buildContextSummary } from "./idle-diagnostic.js"
import type { SessionMessage } from "../types.js"

function createAssistantMessage(
  finish: string | undefined,
  text: string,
): SessionMessage {
  return {
    info: {
      role: "assistant",
      finish,
    },
    parts: [{ type: "text", text }],
  }
}

function createUserMessage(text: string): SessionMessage {
  return {
    info: {
      role: "user",
    },
    parts: [{ type: "text", text }],
  }
}

describe("diagnoseIdle()", () => {
  it("empty message list → error, no_response", () => {
    const result = diagnoseIdle([])
    expect(result.verdict).toBe("error")
    expect(result.reason).toBe("no_response")
  })

  it("only user message → error, no_response", () => {
    const messages = [createUserMessage("Hello")]
    const result = diagnoseIdle(messages)
    expect(result.verdict).toBe("error")
    expect(result.reason).toBe("no_response")
  })

  it('finish_reason "stop" + normal text → completed', () => {
    const messages = [createAssistantMessage("stop", "Task done.")]
    const result = diagnoseIdle(messages)
    expect(result.verdict).toBe("completed")
    expect(result.reason).toBe("normal_completion")
    expect(result.lastMessage).toBe("Task done.")
  })

  it('finish_reason "stop" + question text → completed (no longer waiting)', () => {
    const messages = [createAssistantMessage("stop", "这个方向对吗？")]
    const result = diagnoseIdle(messages)
    expect(result.verdict).toBe("completed")
    expect(result.reason).toBe("normal_completion")
  })

  it('finish_reason "length" → error, finish_length', () => {
    const messages = [createAssistantMessage("length", "...")]
    const result = diagnoseIdle(messages)
    expect(result.verdict).toBe("error")
    expect(result.reason).toBe("finish_length")
  })

  it('finish_reason "content_filter" → error, finish_content_filter', () => {
    const messages = [createAssistantMessage("content_filter", "")]
    const result = diagnoseIdle(messages)
    expect(result.verdict).toBe("error")
    expect(result.reason).toBe("finish_content_filter")
  })

  it("no finish_reason + text → completed", () => {
    const messages = [createAssistantMessage(undefined, "Proceeding.")]
    const result = diagnoseIdle(messages)
    expect(result.verdict).toBe("completed")
    expect(result.reason).toBe("normal_completion")
    expect(result.lastMessage).toBe("Proceeding.")
  })

  it("no finish_reason + no text → error, no_response", () => {
    const messages = [createAssistantMessage(undefined, "")]
    const result = diagnoseIdle(messages)
    expect(result.verdict).toBe("error")
    expect(result.reason).toBe("no_response")
  })

  it("reasoning part is excluded from text extraction", () => {
    const messages: SessionMessage[] = [
      {
        info: { role: "assistant", finish: "stop" },
        parts: [
          { type: "reasoning", text: "我是否需要回滚？应该如何处理？" },
          { type: "text", text: "任务已完成。" },
        ],
      },
    ]
    const result = diagnoseIdle(messages)
    expect(result.verdict).toBe("completed")
    expect(result.reason).toBe("normal_completion")
    expect(result.lastMessage).toBe("任务已完成。")
  })

  it("synthetic text part is excluded from text extraction", () => {
    const messages: SessionMessage[] = [
      {
        info: { role: "assistant", finish: "stop" },
        parts: [
          { type: "text", text: "是否需要确认？", synthetic: true } as any,
          { type: "text", text: "结果已输出。" },
        ],
      },
    ]
    const result = diagnoseIdle(messages)
    expect(result.verdict).toBe("completed")
    expect(result.reason).toBe("normal_completion")
    expect(result.lastMessage).toBe("结果已输出。")
  })

  it("only reasoning parts (no text) → completed", () => {
    const messages: SessionMessage[] = [
      {
        info: { role: "assistant", finish: "stop" },
        parts: [{ type: "reasoning", text: "我应该先检查目录结构" }],
      },
    ]
    const result = diagnoseIdle(messages)
    expect(result.verdict).toBe("completed")
    expect(result.reason).toBe("normal_completion")
  })

  it("verdict type is only completed or error (never waiting)", () => {
    const messages = [createAssistantMessage("stop", "Any text")]
    const result = diagnoseIdle(messages)
    expect(result.verdict).toMatch(/^(completed|error)$/)
  })

  it("multiple messages → uses last assistant message", () => {
    const messages: SessionMessage[] = [
      createUserMessage("Do something"),
      createAssistantMessage("stop", "First response"),
      createUserMessage("Do more"),
      createAssistantMessage("stop", "Final response"),
    ]
    const result = diagnoseIdle(messages)
    expect(result.verdict).toBe("completed")
    expect(result.lastMessage).toBe("Final response")
  })
})

describe("buildContextSummary()", () => {
  it("empty messages → empty string", () => {
    expect(buildContextSummary([])).toBe("")
  })

  it("single assistant text message → contains the text", () => {
    const messages = [createAssistantMessage("stop", "Hello world")]
    const summary = buildContextSummary(messages)
    expect(summary).toBe("Hello world")
  })

  it("multiple messages with tool calls → extracts tool names with numbers", () => {
    const messages: SessionMessage[] = [
      {
        info: { role: "assistant" },
        parts: [{ type: "tool", tool: "read_file", callID: "1" }],
      },
      {
        info: { role: "assistant" },
        parts: [{ type: "tool", tool: "write_file", callID: "2" }],
      },
    ]
    const summary = buildContextSummary(messages)
    expect(summary).toContain("1. read_file()")
    expect(summary).toContain("2. write_file()")
  })

  it("tool result exceeds max length → truncates to maxLength", () => {
    const messages: SessionMessage[] = []
    for (let i = 0; i < 100; i++) {
      messages.push({
        info: { role: "assistant" },
        parts: [{ type: "tool", tool: `tool_${i}`, callID: `${i}` }],
      })
    }
    const summary = buildContextSummary(messages, 100)
    expect(summary.length).toBeLessThanOrEqual(103) // 100 + "..."
    expect(summary.endsWith("...")).toBe(true)
  })

  it("mixed message types → only extracts assistant tool calls", () => {
    const messages: SessionMessage[] = [
      createUserMessage("Please help"),
      {
        info: { role: "assistant" },
        parts: [{ type: "tool", tool: "bash", callID: "1" }],
      },
      {
        info: { role: "tool" },
        parts: [{ type: "text", text: "output" }],
      },
      {
        info: { role: "assistant" },
        parts: [{ type: "tool", tool: "read", callID: "2" }],
      },
    ]
    const summary = buildContextSummary(messages)
    expect(summary).toContain("1. bash()")
    expect(summary).toContain("2. read()")
  })
})
