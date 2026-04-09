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
    question: {
      reply: vi.fn().mockResolvedValue(undefined),
    },
  }
}

function createMockTaskManager(
  task?: WopalTask,
  client?: ReturnType<typeof createMockClient>,
  v2Client?: { question?: { reply?: ReturnType<typeof vi.fn> } },
  serverUrl?: URL,
) {
  const mockClient = client ?? createMockClient()
  return {
    getTaskForParent: vi.fn((id: string, parentID: string) =>
      task && task.id === id && task.parentSessionID === parentID ? task : undefined,
    ),
    getClient: vi.fn(() => mockClient),
    getV2Client: vi.fn(() => v2Client),
    getServerUrl: vi.fn(() => serverUrl),
  }
}

describe("wopal_reply", () => {
  const parentSessionID = "parent-session-123"

  function createWaitingTask(overrides?: Partial<WopalTask>): WopalTask {
    return {
      id: "wopal-task-456",
      sessionID: "child-session-789",
      status: "waiting",
      waitingReason: "question_detected",
      description: "Test task",
      agent: "fae",
      prompt: "Do something",
      parentSessionID,
      createdAt: new Date(),
      ...overrides,
    }
  }

  it("fails when context session id is missing", async () => {
    const mockManager = createMockTaskManager()
    const execute = getExecute(createWopalReplyTool(mockManager as never))

    const result = await execute({ task_id: "wopal-task-456", message: "test" }, {})

    expect(result).toBe("Error: Current session ID is unavailable; cannot reply to task.")
  })

  it("task_id not found: returns error", async () => {
    const mockManager = createMockTaskManager(undefined)
    const execute = getExecute(createWopalReplyTool(mockManager as never))

    const result = await execute(
      { task_id: "nonexistent", message: "test" },
      { sessionID: parentSessionID },
    )

    expect(result).toBe("Error: Task not found or not owned by this session")
  })

  it("task status is completed (not waiting): returns error", async () => {
    const completedTask = createWaitingTask({ status: "completed" })
    const mockManager = createMockTaskManager(completedTask)
    const execute = getExecute(createWopalReplyTool(mockManager as never))

    const result = await execute(
      { task_id: completedTask.id, message: "test" },
      { sessionID: parentSessionID },
    )

    expect(result).toBe("Error: Task is completed. Only running and waiting tasks can receive replies.")
  })

  

  it("idle task (running + idleNotified): sends message via promptAsync, clears idleNotified", async () => {
    const mockClient = createMockClient()
    const idleTask = createWaitingTask({ status: "running", idleNotified: true } as Partial<WopalTask>)
    const mockManager = createMockTaskManager(idleTask, mockClient)
    const execute = getExecute(createWopalReplyTool(mockManager as never))

    const result = await execute(
      { task_id: idleTask.id, message: "继续完善" },
      { sessionID: parentSessionID },
    )

    expect(result).toBe(`Reply sent to task ${idleTask.id}. The background task will continue execution.`)
    expect(mockClient.session.promptAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        path: { id: idleTask.sessionID },
      }),
    )
    expect(idleTask.idleNotified).toBeUndefined()
    expect(idleTask.status).toBe("running")
    expect(idleTask.waitingReason).toBeUndefined()
  })

  it("task status is waiting with valid message: calls promptAsync, status becomes running, returns success", async () => {
    const mockClient = createMockClient()
    const task = createWaitingTask()
    const mockManager = createMockTaskManager(task, mockClient)
    const execute = getExecute(createWopalReplyTool(mockManager as never))

    const result = await execute(
      { task_id: task.id, message: "Continue with option A" },
      { sessionID: parentSessionID },
    )

    expect(result).toBe(`Reply sent to task ${task.id}. The background task will continue execution.`)
    expect(mockClient.session.promptAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        path: { id: task.sessionID },
      }),
    )
    expect(task.status).toBe("running")
    expect(task.waitingReason).toBeUndefined()
  })

  it("task with pendingQuestionID: calls question.reply to resolve Deferred", async () => {
    const mockClient = createMockClient()
    const mockV2Client = {
      question: {
        reply: vi.fn().mockResolvedValue(undefined),
      },
    }
    const task = createWaitingTask({ pendingQuestionID: "question-req-123" })
    const mockManager = createMockTaskManager(task, mockClient, mockV2Client)
    const execute = getExecute(createWopalReplyTool(mockManager as never))

    const result = await execute(
      { task_id: task.id, message: "ok" },
      { sessionID: parentSessionID },
    )

    expect(result).toBe(`Reply sent to task ${task.id}. The background task will continue execution.`)
    expect(mockV2Client.question.reply).toHaveBeenCalledWith({
      requestID: "question-req-123",
      answers: [["ok"]],
    })
    expect(mockClient.question.reply).not.toHaveBeenCalled()
    expect(mockClient.session.promptAsync).not.toHaveBeenCalled()
    expect(task.status).toBe("running")
    expect(task.pendingQuestionID).toBeUndefined()
  })

  it("task with pendingQuestionID but no v2 client: returns error", async () => {
    const mockClient = createMockClient()
    mockClient.question = {} as never
    const task = createWaitingTask({ pendingQuestionID: "question-req-456" })
    const mockManager = createMockTaskManager(task, mockClient)
    const execute = getExecute(createWopalReplyTool(mockManager as never))

    const result = await execute(
      { task_id: task.id, message: "ok" },
      { sessionID: parentSessionID },
    )

    expect(result).toBe("Failed to send reply: question.reply is unavailable")
    expect(task.status).toBe("waiting")
    expect(task.pendingQuestionID).toBe("question-req-456")
  })

  it("task with pendingQuestionID but no SDK or serverUrl: returns error", async () => {
    const mockClient = createMockClient()
    mockClient.question = {} as never
    const task = createWaitingTask({ pendingQuestionID: "question-req-789" })
    const mockManager = createMockTaskManager(task, mockClient)
    const execute = getExecute(createWopalReplyTool(mockManager as never))

    const result = await execute(
      { task_id: task.id, message: "ok" },
      { sessionID: parentSessionID },
    )

    expect(result).toBe("Failed to send reply: question.reply is unavailable")
    expect(task.status).toBe("waiting")
    expect(task.pendingQuestionID).toBe("question-req-789")
  })

  it("task without sessionID: returns error", async () => {
    const taskWithoutSession = createWaitingTask({ sessionID: undefined })
    const mockManager = createMockTaskManager(taskWithoutSession)
    const execute = getExecute(createWopalReplyTool(mockManager as never))

    const result = await execute(
      { task_id: taskWithoutSession.id, message: "test" },
      { sessionID: parentSessionID },
    )

    expect(result).toBe("Error: Task has no active session")
  })

  it("promptAsync fails: returns error message, status remains waiting", async () => {
    const mockClient = createMockClient()
    mockClient.session.promptAsync.mockRejectedValueOnce(new Error("Network error"))
    const task = createWaitingTask()
    const mockManager = createMockTaskManager(task, mockClient)
    const execute = getExecute(createWopalReplyTool(mockManager as never))

    const result = await execute(
      { task_id: task.id, message: "test" },
      { sessionID: parentSessionID },
    )

    expect(result).toBe("Failed to send reply: Network error")
    expect(task.status).toBe("waiting")
  })

  it("promptAsync unavailable: returns error", async () => {
    const mockClient = {
      session: {},
    }
    const task = createWaitingTask()
    const mockManager = createMockTaskManager(task, mockClient as never)
    const execute = getExecute(createWopalReplyTool(mockManager as never))

    const result = await execute(
      { task_id: task.id, message: "test" },
      { sessionID: parentSessionID },
    )

    expect(result).toBe("Error: session.promptAsync is unavailable")
  })
})
