import { describe, expect, it, vi } from "vitest"
import { createWopalTaskDiffTool } from "./wopal-task-diff.js"
import type { WopalTask } from "../types.js"

function getExecute(toolDefinition: unknown) {
  return (toolDefinition as { execute: (...args: unknown[]) => Promise<unknown> }).execute
}

function createMockTaskManager(
  task?: WopalTask,
  v2Client?: { session?: { diff?: ReturnType<typeof vi.fn> } },
) {
  return {
    getTaskForParent: vi.fn((id: string, parentID: string) =>
      task && task.id === id && task.parentSessionID === parentID ? task : undefined,
    ),
    getV2Client: vi.fn(() => v2Client),
  }
}

describe("wopal_task_diff", () => {
  const parentSessionID = "parent-session-123"

  function createTask(overrides?: Partial<WopalTask>): WopalTask {
    return {
      id: "wopal-task-456",
      sessionID: "child-session-789",
      status: "running",
      description: "Test task",
      agent: "fae",
      prompt: "Do something",
      parentSessionID,
      createdAt: new Date(),
      ...overrides,
    }
  }

  it("returns 'No file changes' when diff is empty", async () => {
    const task = createTask()
    const mockV2Client = {
      session: {
        diff: vi.fn().mockResolvedValue({ data: [] }),
        messages: vi.fn().mockResolvedValue({ data: [] }),
      },
    }
    const mockManager = createMockTaskManager(task, mockV2Client)
    const execute = getExecute(createWopalTaskDiffTool(mockManager as never))

    const result = await execute(
      { task_id: task.id },
      { sessionID: parentSessionID },
    )

    expect(result).toContain("No file changes in this task.")
    expect(mockV2Client.session.diff).toHaveBeenCalledWith({
      sessionID: task.sessionID,
    })
  })

  it("formats file changes correctly", async () => {
    const task = createTask()
    const mockV2Client = {
      session: {
        diff: vi.fn().mockResolvedValue({
          data: [
            { file: "src/index.ts", additions: 10, deletions: 2, status: "modified" },
            { file: "src/new.ts", additions: 20, deletions: 0, status: "added" },
            { file: "src/old.ts", additions: 0, deletions: 5, status: "deleted" },
          ],
        }),
        messages: vi.fn().mockResolvedValue({ data: [] }),
      },
    }
    const mockManager = createMockTaskManager(task, mockV2Client)
    const execute = getExecute(createWopalTaskDiffTool(mockManager as never))

    const result = await execute(
      { task_id: task.id },
      { sessionID: parentSessionID },
    )

    expect(result).toContain("File changes for task")
    expect(result).toContain("[~] src/index.ts (+10/-2)")
    expect(result).toContain("[+] src/new.ts (+20/-0)")
    expect(result).toContain("[-] src/old.ts (+0/-5)")
    expect(result).toContain("Total: 3 files changed, +30/-7 lines")
  })

  it("returns graceful fallback when v2Client.session.diff is unavailable", async () => {
    const task = createTask()
    const mockV2Client = {}
    const mockManager = createMockTaskManager(task, mockV2Client)
    const execute = getExecute(createWopalTaskDiffTool(mockManager as never))

    const result = await execute(
      { task_id: task.id },
      { sessionID: parentSessionID },
    )

    expect(result).toContain("File diff is unavailable")
    expect(result).toContain("Use wopal_task_output")
  })

  it("returns error when task not found", async () => {
    const mockManager = createMockTaskManager(undefined)
    const execute = getExecute(createWopalTaskDiffTool(mockManager as never))

    const result = await execute(
      { task_id: "nonexistent" },
      { sessionID: parentSessionID },
    )

    expect(result).toContain("Task not found")
  })

  it("returns error when task has no sessionID", async () => {
    const task = createTask({ sessionID: undefined })
    const mockManager = createMockTaskManager(task)
    const execute = getExecute(createWopalTaskDiffTool(mockManager as never))

    const result = await execute(
      { task_id: task.id },
      { sessionID: parentSessionID },
    )

    expect(result).toContain("Task has no active session")
  })

  it("returns error when sessionID missing in context", async () => {
    const mockManager = createMockTaskManager()
    const execute = getExecute(createWopalTaskDiffTool(mockManager as never))

    const result = await execute({ task_id: "task-1" }, {})

    expect(result).toBe("Current session ID is unavailable; cannot check diff.")
  })

  it("handles diff API error gracefully", async () => {
    const task = createTask()
    const mockV2Client = {
      session: {
        diff: vi.fn().mockRejectedValue(new Error("API error")),
        messages: vi.fn().mockResolvedValue({ data: [] }),
      },
    }
    const mockManager = createMockTaskManager(task, mockV2Client)
    const execute = getExecute(createWopalTaskDiffTool(mockManager as never))

    const result = await execute(
      { task_id: task.id },
      { sessionID: parentSessionID },
    )

    expect(result).toContain("Failed to retrieve diff")
    expect(result).toContain("API error")
  })
})