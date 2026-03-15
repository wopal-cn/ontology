import { describe, expect, it, vi } from "vitest"
import { OpenCodeRulesRuntime } from "./runtime.js"
import { SessionStore } from "./session-store.js"

function createRuntime(taskManager: {
  markTaskCompletedBySession: ReturnType<typeof vi.fn>
  markTaskErrorBySession: ReturnType<typeof vi.fn>
  notifyParent: ReturnType<typeof vi.fn>
}) {
  return new OpenCodeRulesRuntime({
    client: {},
    directory: "/tmp",
    projectDirectory: "/tmp",
    ruleFiles: [],
    sessionStore: new SessionStore({ max: 10 }),
    debugLog: () => {},
    taskManager: taskManager as never,
  })
}

describe("OpenCodeRulesRuntime event handling", () => {
  it("marks running task completed on session.idle and notifies parent", async () => {
    const taskManager = {
      markTaskCompletedBySession: vi.fn().mockReturnValue({ id: "task-1" }),
      markTaskErrorBySession: vi.fn(),
      notifyParent: vi.fn().mockResolvedValue(undefined),
    }
    const runtime = createRuntime(taskManager)

    await (runtime as unknown as { onEvent: (input: unknown) => Promise<void> }).onEvent({
      event: { type: "session.idle", properties: { sessionID: "child-1" } },
    })

    expect(taskManager.markTaskCompletedBySession).toHaveBeenCalledWith("child-1")
    expect(taskManager.notifyParent).toHaveBeenCalledWith("task-1")
  })

  it("marks running task errored on session.error and notifies parent", async () => {
    const taskManager = {
      markTaskCompletedBySession: vi.fn(),
      markTaskErrorBySession: vi.fn().mockReturnValue({ id: "task-1" }),
      notifyParent: vi.fn().mockResolvedValue(undefined),
    }
    const runtime = createRuntime(taskManager)

    await (runtime as unknown as { onEvent: (input: unknown) => Promise<void> }).onEvent({
      event: {
        type: "session.error",
        properties: { sessionID: "child-1", error: { code: "boom" } },
      },
    })

    expect(taskManager.markTaskErrorBySession).toHaveBeenCalledWith(
      "child-1",
      JSON.stringify({ code: "boom" }),
    )
    expect(taskManager.notifyParent).toHaveBeenCalledWith("task-1")
  })

  it("does not notify when idle event arrives after task already finalized", async () => {
    const taskManager = {
      markTaskCompletedBySession: vi.fn().mockReturnValue(undefined),
      markTaskErrorBySession: vi.fn(),
      notifyParent: vi.fn().mockResolvedValue(undefined),
    }
    const runtime = createRuntime(taskManager)

    await (runtime as unknown as { onEvent: (input: unknown) => Promise<void> }).onEvent({
      event: { type: "session.idle", properties: { sessionID: "child-1" } },
    })

    expect(taskManager.notifyParent).not.toHaveBeenCalled()
  })

  it("does not notify when error event arrives after task already finalized", async () => {
    const taskManager = {
      markTaskCompletedBySession: vi.fn(),
      markTaskErrorBySession: vi.fn().mockReturnValue(undefined),
      notifyParent: vi.fn().mockResolvedValue(undefined),
    }
    const runtime = createRuntime(taskManager)

    await (runtime as unknown as { onEvent: (input: unknown) => Promise<void> }).onEvent({
      event: {
        type: "session.error",
        properties: { sessionID: "child-1", error: "boom" },
      },
    })

    expect(taskManager.notifyParent).not.toHaveBeenCalled()
  })
})
