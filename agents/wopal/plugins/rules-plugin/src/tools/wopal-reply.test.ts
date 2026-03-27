import { describe, expect, it, vi } from "vitest"
import { createWopalReplyTool } from "./wopal-reply.js"
import type { WopalTask } from "../types.js"

function getExecute(toolDefinition: unknown) {
  return (toolDefinition as { execute: (...args: unknown[]) => Promise<unknown> }).execute
}

function createMockClient() {
  return {
    session: {
      promptAsync: vi.fn().mockResolvedValue(undefined),
    },
  }
}

function createMockTaskManager(
  task?: WopalTask,
  client?: ReturnType<typeof createMockClient>,
) {
  const mockClient = client ?? createMockClient()
  return {
    getTaskForParent: vi.fn((id: string, parentID: string) =>
      task && task.id === id && task.parentSessionID === parentID ? task : undefined,
    ),
    getClient: vi.fn(() => mockClient),
  }
}

describe("wopal_reply", () => {
  const parentSessionID = "parent-session-123"

  const waitingTask: WopalTask = {
    id: "wopal-task-456",
    sessionID: "child-session-789",
    status: "waiting",
    waitingReason: "question_detected",
    description: "Test task",
    agent: "fae",
    prompt: "Do something",
    parentSessionID,
    createdAt: new Date(),
  }

  it("fails when context session id is missing", async () => {
    const mockManager = createMockTaskManager()
    const execute = getExecute(createWopalReplyTool(mockManager as never))

    const result = await execute({ task_id: "wopal-task-456", message: "test" }, {})

    expect(result).toEqual({
      error: "Current session ID is unavailable; cannot reply to task.",
    })
  })

  it("task_id not found: returns error", async () => {
    const mockManager = createMockTaskManager(undefined)
    const execute = getExecute(createWopalReplyTool(mockManager as never))

    const result = await execute(
      { task_id: "nonexistent", message: "test" },
      { sessionID: parentSessionID },
    )

    expect(result).toEqual({ error: "Task not found or not owned by this session" })
  })

  it("task not owned by current parent session: returns error", async () => {
    const mockManager = createMockTaskManager(waitingTask)
    const execute = getExecute(createWopalReplyTool(mockManager as never))

    const result = await execute(
      { task_id: waitingTask.id, message: "test" },
      { sessionID: "different-parent" },
    )

    expect(result).toEqual({ error: "Task not found or not owned by this session" })
  })

  it("task status is completed (not waiting): returns error", async () => {
    const completedTask = { ...waitingTask, status: "completed" as const }
    const mockManager = createMockTaskManager(completedTask)
    const execute = getExecute(createWopalReplyTool(mockManager as never))

    const result = await execute(
      { task_id: completedTask.id, message: "test" },
      { sessionID: parentSessionID },
    )

    expect(result).toEqual({
      error: "Task is completed, not waiting. Only waiting tasks can receive replies.",
    })
  })

  it("task status is running (not waiting): returns error", async () => {
    const runningTask = { ...waitingTask, status: "running" as const }
    const mockManager = createMockTaskManager(runningTask)
    const execute = getExecute(createWopalReplyTool(mockManager as never))

    const result = await execute(
      { task_id: runningTask.id, message: "test" },
      { sessionID: parentSessionID },
    )

    expect(result).toEqual({
      error: "Task is running, not waiting. Only waiting tasks can receive replies.",
    })
  })

  it("task status is waiting with valid message: calls promptAsync, status becomes running, returns success", async () => {
    const mockClient = createMockClient()
    const mockManager = createMockTaskManager(waitingTask, mockClient)
    const execute = getExecute(createWopalReplyTool(mockManager as never))

    const result = await execute(
      { task_id: waitingTask.id, message: "Continue with option A" },
      { sessionID: parentSessionID },
    )

    expect(result).toEqual({
      success: true,
      message: `Reply sent to task ${waitingTask.id}. The background task will continue execution.`,
    })
    expect(mockClient.session.promptAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        path: { id: waitingTask.sessionID },
      }),
    )
    expect(waitingTask.status).toBe("running")
    expect(waitingTask.waitingReason).toBeUndefined()
  })

  it("task without sessionID: returns error", async () => {
    const taskWithoutSession = { ...waitingTask, sessionID: undefined }
    const mockManager = createMockTaskManager(taskWithoutSession)
    const execute = getExecute(createWopalReplyTool(mockManager as never))

    const result = await execute(
      { task_id: taskWithoutSession.id, message: "test" },
      { sessionID: parentSessionID },
    )

    expect(result).toEqual({ error: "Task has no active session" })
  })

  it("promptAsync fails: returns error message, status remains waiting", async () => {
    const mockClient = createMockClient()
    mockClient.session.promptAsync.mockRejectedValueOnce(new Error("Network error"))
    const mockManager = createMockTaskManager(waitingTask, mockClient)
    const execute = getExecute(createWopalReplyTool(mockManager as never))

    const result = await execute(
      { task_id: waitingTask.id, message: "test" },
      { sessionID: parentSessionID },
    )

    expect(result).toEqual({ error: "Failed to send reply: Network error" })
    expect(waitingTask.status).toBe("waiting")
  })

  it("promptAsync unavailable: returns error", async () => {
    const mockClient = {
      session: {},
    }
    const mockManager = createMockTaskManager(waitingTask, mockClient as never)
    const execute = getExecute(createWopalReplyTool(mockManager as never))

    const result = await execute(
      { task_id: waitingTask.id, message: "test" },
      { sessionID: parentSessionID },
    )

    expect(result).toEqual({ error: "session.promptAsync is unavailable" })
  })
})