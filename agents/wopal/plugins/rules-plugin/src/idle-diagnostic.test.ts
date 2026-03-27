import { describe, it, expect } from "vitest"
import {
  diagnoseIdle,
  detectQuestionPattern,
  buildContextSummary,
} from "./idle-diagnostic.js"
import type { SessionMessage } from "./types.js"

// Helper to create assistant message
function createAssistantMessage(
  finish: string | undefined,
  text: string
): SessionMessage {
  return {
    info: {
      role: "assistant",
      finish,
    },
    parts: [{ type: "text", text }],
  }
}

// Helper to create user message
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

  it('finish_reason "stop" + normal text → completed, normal_completion', () => {
    const messages = [createAssistantMessage("stop", "Task done.")]
    const result = diagnoseIdle(messages)
    expect(result.verdict).toBe("completed")
    expect(result.reason).toBe("normal_completion")
    expect(result.lastMessage).toBe("Task done.")
  })

  it('finish_reason "stop" + question text → waiting, question_detected', () => {
    const messages = [createAssistantMessage("stop", "应该如何处理?")]
    const result = diagnoseIdle(messages)
    expect(result.verdict).toBe("waiting")
    expect(result.reason).toBe("question_detected")
    expect(result.lastMessage).toBe("应该如何处理?")
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

  it("no finish_reason + non-question text → completed, normal_completion", () => {
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
})

describe("detectQuestionPattern()", () => {
  it('ends with "?" → true', () => {
    expect(detectQuestionPattern("How to proceed?")).toBe(true)
  })

  it('ends with "？" → true', () => {
    expect(detectQuestionPattern("这个方向对吗？")).toBe(true)
  })

  it('contains "应该" → true', () => {
    expect(detectQuestionPattern("我应该选择哪个")).toBe(true)
  })

  it('contains "如何" → true', () => {
    expect(detectQuestionPattern("如何处理这个")).toBe(true)
  })

  it('contains "是否" → true', () => {
    expect(detectQuestionPattern("是否需要回滚")).toBe(true)
  })

  it('contains "要不要" → true', () => {
    expect(detectQuestionPattern("要不要加测试")).toBe(true)
  })

  it('contains "需要...吗" → true', () => {
    expect(detectQuestionPattern("需要先创建分支吗")).toBe(true)
  })

  it('contains "请确认" → true', () => {
    expect(detectQuestionPattern("请确认配置")).toBe(true)
  })

  it('contains "请选择" → true', () => {
    expect(detectQuestionPattern("请选择方向")).toBe(true)
  })

  it("numbered option pattern → true", () => {
    expect(detectQuestionPattern("1) A\n2) B")).toBe(true)
    expect(detectQuestionPattern("1. X\n2. Y")).toBe(true)
  })

  it("letter option pattern → true", () => {
    expect(detectQuestionPattern("A. X\nB. Y")).toBe(true)
    expect(detectQuestionPattern("A) X\nB) Y")).toBe(true)
  })

  it("normal statement → false", () => {
    expect(detectQuestionPattern("Task done.")).toBe(false)
  })

  it("? in URL → false", () => {
    expect(detectQuestionPattern("See https://x.com?page=1")).toBe(false)
  })

  it("empty text → false", () => {
    expect(detectQuestionPattern("")).toBe(false)
    expect(detectQuestionPattern("   ")).toBe(false)
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
        parts: [{ type: "tool_result", content: "output" }],
      },
      {
        info: { role: "assistant" },
        parts: [{ type: "tool", tool: "read", callID: "2" }],
      },
    ]
    const summary = buildContextSummary(messages)
    expect(summary).toContain("1. bash()")
    expect(summary).toContain("2. read()")
    // Should not contain tool_result as a tool call
    expect(summary).not.toContain("tool_result")
  })
})