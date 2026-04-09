import { describe, it, expect } from "vitest"
import { isMeaningfulActivity, trackActivity } from "./progress-tracker.js"
import type { WopalTask } from "./types.js"

function createTask(overrides: Partial<WopalTask> = {}): WopalTask {
  return {
    id: "task-1",
    status: "running",
    description: "Test task",
    agent: "fae",
    prompt: "test",
    parentSessionID: "parent-1",
    createdAt: new Date(),
    startedAt: new Date(Date.now() - 60_000),
    sessionID: "session-1",
    progress: { toolCalls: 0, lastUpdate: new Date() },
    ...overrides,
  } as WopalTask
}

describe("isMeaningfulActivity", () => {
  it("should identify tool as meaningful", () => {
    expect(isMeaningfulActivity("tool")).toBe(true)
  })

  it("should identify text as meaningful", () => {
    expect(isMeaningfulActivity("text")).toBe(true)
  })

  it("should not identify reasoning as meaningful", () => {
    expect(isMeaningfulActivity("reasoning")).toBe(false)
  })

  it("should not identify tool_result as meaningful", () => {
    expect(isMeaningfulActivity("tool_result")).toBe(false)
  })

  it("should handle undefined as not meaningful", () => {
    expect(isMeaningfulActivity(undefined)).toBe(false)
  })

  it("should handle empty string as not meaningful", () => {
    expect(isMeaningfulActivity("")).toBe(false)
  })
})

describe("trackActivity", () => {
  it("should update lastMeaningfulActivity for tool_call", () => {
    const task = createTask()
    const before = new Date()
    const result = trackActivity(task, "tool")

    expect(result).toBe(true)
    expect(task.progress?.lastMeaningfulActivity).toBeDefined()
    expect(task.progress?.lastMeaningfulActivity!.getTime()).toBeGreaterThanOrEqual(before.getTime())
    expect(task.progress?.lastUpdate).toEqual(task.progress?.lastMeaningfulActivity)
    expect(task.progress?.toolCalls).toBe(1)
  })

  it("should update lastMeaningfulActivity for text", () => {
    const task = createTask()
    const result = trackActivity(task, "text")

    expect(result).toBe(true)
    expect(task.progress?.lastMeaningfulActivity).toBeDefined()
    expect(task.progress?.toolCalls).toBe(0)
  })

  it("should not update for reasoning", () => {
    const task = createTask()
    const originalUpdate = task.progress?.lastUpdate
    const result = trackActivity(task, "reasoning")

    expect(result).toBe(false)
    expect(task.progress?.lastMeaningfulActivity).toBeUndefined()
    expect(task.progress?.lastUpdate).toEqual(originalUpdate)
  })

  it("should not update for tool_result", () => {
    const task = createTask()
    const result = trackActivity(task, "tool_result")

    expect(result).toBe(false)
    expect(task.progress?.lastMeaningfulActivity).toBeUndefined()
  })

  it("should increment toolCalls for repeated tool_call", () => {
    const task = createTask()
    trackActivity(task, "tool")
    trackActivity(task, "tool")
    trackActivity(task, "tool")

    expect(task.progress?.toolCalls).toBe(3)
  })

  it("should not increment toolCalls for text", () => {
    const task = createTask()
    trackActivity(task, "text")
    trackActivity(task, "text")

    expect(task.progress?.toolCalls).toBe(0)
  })

  it("should handle task without progress gracefully", () => {
    const task: WopalTask = {
      id: "task-no-progress",
      status: "running",
      description: "Test task",
      agent: "fae",
      prompt: "test",
      parentSessionID: "parent-1",
      createdAt: new Date(),
      startedAt: new Date(Date.now() - 60_000),
      sessionID: "session-1",
    }
    const result = trackActivity(task, "tool")

    expect(result).toBe(false)
  })

  it("should also update lastUpdate when tracking meaningful activity", () => {
    const task = createTask()
    task.progress!.lastUpdate = new Date(Date.now() - 10_000)
    const oldUpdateTime = task.progress!.lastUpdate.getTime()

    trackActivity(task, "text")

    expect(task.progress?.lastUpdate.getTime()).toBeGreaterThan(oldUpdateTime)
    expect(task.progress?.lastUpdate).toEqual(task.progress?.lastMeaningfulActivity)
  })
})
