import { describe, it, expect } from "vitest"
import {
  checkAndInterruptStaleTasks,
  DEFAULT_STALE_TIMEOUT_MS,
  DEFAULT_MESSAGE_STALENESS_TIMEOUT_MS,
  MIN_RUNTIME_BEFORE_STALE_MS,
} from "./stale-detector.js"
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
    ...overrides,
  } as WopalTask
}

describe("checkAndInterruptStaleTasks", () => {
  const defaultConfig = {
    staleTimeoutMs: DEFAULT_STALE_TIMEOUT_MS,
    messageStalenessMs: DEFAULT_MESSAGE_STALENESS_TIMEOUT_MS,
    minRuntimeBeforeStaleMs: MIN_RUNTIME_BEFORE_STALE_MS,
  }

  it("should not interrupt task with recent progress", async () => {
    const tasks: WopalTask[] = [
      createTask({
        id: "task-1",
        startedAt: new Date(Date.now() - 60_000),
        progress: { toolCalls: 5, lastUpdate: new Date(Date.now() - 60_000) },
      }),
    ]

    let interrupted = false
    checkAndInterruptStaleTasks({
      tasks,
      config: defaultConfig,
      onStale: async () => {
        interrupted = true
      },
    })

    expect(interrupted).toBe(false)
  })

  it("should interrupt task with stale progress", async () => {
    const tasks: WopalTask[] = [
      createTask({
        id: "task-2",
        startedAt: new Date(Date.now() - 300_000),
        progress: {
          toolCalls: 5,
          lastUpdate: new Date(Date.now() - DEFAULT_STALE_TIMEOUT_MS - 10_000),
        },
      }),
    ]

    let interruptedTask: WopalTask | null = null
    let interruptedReason = ""
    checkAndInterruptStaleTasks({
      tasks,
      config: defaultConfig,
      onStale: async (task, reason) => {
        interruptedTask = task
        interruptedReason = reason
      },
    })

    expect(interruptedTask).not.toBeNull()
    expect(interruptedTask?.id).toBe("task-2")
    expect(interruptedReason).toContain("no activity")
  })

  it("should interrupt task with no progress after messageStalenessMs", async () => {
    const tasks: WopalTask[] = [
      createTask({
        id: "task-3",
        startedAt: new Date(Date.now() - DEFAULT_MESSAGE_STALENESS_TIMEOUT_MS - 10_000),
        progress: undefined,
      }),
    ]

    let interruptedTask: WopalTask | null = null
    checkAndInterruptStaleTasks({
      tasks,
      config: defaultConfig,
      onStale: async (task) => {
        interruptedTask = task
      },
    })

    expect(interruptedTask).not.toBeNull()
    expect(interruptedTask?.id).toBe("task-3")
  })

  it("should not interrupt task that is not running", async () => {
    const tasks: WopalTask[] = [
      createTask({
        id: "task-4",
        status: "completed",
        startedAt: new Date(Date.now() - 2_000_000),
        progress: undefined,
      }),
    ]

    let interrupted = false
    checkAndInterruptStaleTasks({
      tasks,
      config: defaultConfig,
      onStale: async () => {
        interrupted = true
      },
    })

    expect(interrupted).toBe(false)
  })

  it("should not interrupt task when session is running", async () => {
    const tasks: WopalTask[] = [
      createTask({
        id: "task-5",
        startedAt: new Date(Date.now() - 2_000_000),
        sessionID: "session-5",
        progress: undefined,
      }),
    ]

    let interrupted = false
    checkAndInterruptStaleTasks({
      tasks,
      config: defaultConfig,
      sessionStatuses: {
        "session-5": { type: "running" },
      },
      onStale: async () => {
        interrupted = true
      },
    })

    expect(interrupted).toBe(false)
  })

  it("should not interrupt task before minRuntimeBeforeStaleMs", async () => {
    const tasks: WopalTask[] = [
      createTask({
        id: "task-6",
        startedAt: new Date(Date.now() - 10_000),
        progress: {
          toolCalls: 1,
          lastUpdate: new Date(Date.now() - 10_000),
        },
      }),
    ]

    let interrupted = false
    checkAndInterruptStaleTasks({
      tasks,
      config: defaultConfig,
      onStale: async () => {
        interrupted = true
      },
    })

    expect(interrupted).toBe(false)
  })
})