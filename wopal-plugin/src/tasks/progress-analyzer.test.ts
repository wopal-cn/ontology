import { describe, it, expect } from "vitest"
import { analyzeProgress } from "./progress-analyzer.js"
import type { SessionMessage } from "../types.js"

describe("analyzeProgress", () => {
  describe("#given empty messages", () => {
    it("returns zero counts", () => {
      const result = analyzeProgress([], [])
      expect(result.totalMessages).toBe(0)
      expect(result.newMessages).toBe(0)
      expect(result.toolCalls).toEqual([])
      expect(result.hasAssistantText).toBe(false)
    })
  })

  describe("#given messages with assistant text", () => {
    it("detects assistant text content", () => {
      const messages: SessionMessage[] = [
        {
          info: { role: "assistant" },
          parts: [{ type: "text", text: "Hello, world!" }],
        },
      ]
      const result = analyzeProgress(messages, messages)
      expect(result.hasAssistantText).toBe(true)
    })

    it("detects reasoning content", () => {
      const messages: SessionMessage[] = [
        {
          info: { role: "assistant" },
          parts: [{ type: "reasoning", text: "Thinking..." }],
        },
      ]
      const result = analyzeProgress(messages, messages)
      expect(result.hasAssistantText).toBe(true)
    })

    it("ignores empty text", () => {
      const messages: SessionMessage[] = [
        {
          info: { role: "assistant" },
          parts: [{ type: "text", text: "   " }],
        },
      ]
      const result = analyzeProgress(messages, messages)
      expect(result.hasAssistantText).toBe(false)
    })
  })

  describe("#given tool calls", () => {
    it("counts tool calls", () => {
      const messages: SessionMessage[] = [
        {
          info: { role: "assistant" },
          parts: [
            { type: "tool", tool: "Read" },
            { type: "tool", tool: "Edit" },
            { type: "tool", tool: "Read" },
          ],
        },
      ]
      const result = analyzeProgress(messages, messages)
      expect(result.toolCalls).toEqual([
        { tool: "Read", count: 2 },
        { tool: "Edit", count: 1 },
      ])
    })

    it("handles tool_call type", () => {
      const messages: SessionMessage[] = [
        {
          info: { role: "assistant" },
          parts: [{ type: "tool", tool: "Bash" }],
        },
      ]
      const result = analyzeProgress(messages, messages)
      expect(result.toolCalls).toEqual([{ tool: "Bash", count: 1 }])
    })

    it("uses unknown for missing tool name", () => {
      const messages: SessionMessage[] = [
        {
          info: { role: "assistant" },
          parts: [{ type: "tool" }],
        },
      ]
      const result = analyzeProgress(messages, messages)
      expect(result.toolCalls).toEqual([{ tool: "unknown", count: 1 }])
    })
  })

  describe("#given finish reason", () => {
    it("extracts finish reason from last assistant message", () => {
      const messages: SessionMessage[] = [
        {
          info: { role: "user" },
          parts: [{ type: "text", text: "Hello" }],
        },
        {
          info: { role: "assistant", finish: "stop" },
          parts: [{ type: "text", text: "Hi" }],
        },
      ]
      const result = analyzeProgress(messages, messages)
      expect(result.finishReason).toBe("stop")
    })

    it("returns undefined when no assistant message", () => {
      const messages: SessionMessage[] = [
        {
          info: { role: "user" },
          parts: [{ type: "text", text: "Hello" }],
        },
      ]
      const result = analyzeProgress(messages, messages)
      expect(result.finishReason).toBeUndefined()
    })
  })

  describe("#given timestamps", () => {
    it("calculates last activity time from message time object", () => {
      const now = Date.now()
      const messages: SessionMessage[] = [
        {
          info: { role: "assistant", time: { created: now - 5000 } },
          parts: [{ type: "text", text: "Hello" }],
        },
      ]
      const result = analyzeProgress(messages, messages)
      expect(result.lastActivityMs).toBeGreaterThanOrEqual(5000)
    })

    it("calculates last activity time from string time", () => {
      const messages: SessionMessage[] = [
        {
          info: { role: "assistant", time: new Date(Date.now() - 10000).toISOString() },
          parts: [{ type: "text", text: "Hello" }],
        },
      ]
      const result = analyzeProgress(messages, messages)
      expect(result.lastActivityMs).toBeGreaterThanOrEqual(9000)
    })

    it("returns zero when no timestamps", () => {
      const messages: SessionMessage[] = [
        {
          info: { role: "assistant" },
          parts: [{ type: "text", text: "Hello" }],
        },
      ]
      const result = analyzeProgress(messages, messages)
      expect(result.lastActivityMs).toBe(0)
    })
  })

  describe("#given new messages", () => {
    it("counts new messages separately", () => {
      const allMessages: SessionMessage[] = [
        { info: { role: "user" } },
        { info: { role: "assistant" } },
        { info: { role: "assistant" } },
      ]
      const newMessages: SessionMessage[] = [
        { info: { role: "assistant" } },
      ]
      const result = analyzeProgress(allMessages, newMessages)
      expect(result.totalMessages).toBe(3)
      expect(result.newMessages).toBe(1)
    })
  })
})
