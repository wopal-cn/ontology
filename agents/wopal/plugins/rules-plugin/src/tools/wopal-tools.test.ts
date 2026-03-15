import { describe, expect, it, vi } from "vitest"
import { createWopalCancelTool } from "./wopal-cancel.js"
import { createWopalOutputTool } from "./wopal-output.js"
import { createWopalTaskTool } from "./wopal-task.js"

function getExecute(toolDefinition: unknown) {
  return (toolDefinition as { execute: (...args: unknown[]) => Promise<string> }).execute
}

describe("wopal tools", () => {
  it("wopal_task fails when context session id is missing", async () => {
    const manager = {
      launch: vi.fn(),
    }

    const execute = getExecute(createWopalTaskTool(manager as never))
    await expect(
      execute(
        { description: "Test task", prompt: "Do something", agent: "general" },
        {},
      ),
    ).resolves.toBe("Failed to launch task: current session ID is unavailable.")
    expect(manager.launch).not.toHaveBeenCalled()
  })

  it("wopal_task surfaces launch failures", async () => {
    const manager = {
      launch: vi.fn().mockResolvedValue({
        ok: false,
        taskId: "task-1",
        status: "error",
        error: "Background task launch failed: session.create is unavailable",
      }),
    }

    const execute = getExecute(createWopalTaskTool(manager as never))
    await expect(
      execute(
        { description: "Test task", prompt: "Do something", agent: "general" },
        { sessionID: "parent-1" },
      ),
    ).resolves.toContain("Reason: Background task launch failed: session.create is unavailable")
  })

  it("wopal_output enforces ownership via current session", async () => {
    const manager = {
      getTaskForParent: vi.fn().mockReturnValue(undefined),
    }

    const execute = getExecute(createWopalOutputTool(manager as never))
    await expect(
      execute({ task_id: "task-1" }, { sessionID: "parent-2" }),
    ).resolves.toBe("Task not found for current session: task-1")
    expect(manager.getTaskForParent).toHaveBeenCalledWith("task-1", "parent-2")
  })

  it("wopal_output describes completed tasks without claiming result retrieval", async () => {
    const manager = {
      getTaskForParent: vi.fn().mockReturnValue({
        id: "task-1",
        status: "completed",
        description: "Test task",
        agent: "general",
        completedAt: new Date("2026-03-15T10:00:00.000Z"),
      }),
    }

    const execute = getExecute(createWopalOutputTool(manager as never))
    const output = await execute({ task_id: "task-1" }, { sessionID: "parent-1" })

    expect(output).toContain("**Status:** completed")
    expect(output).toContain("Result retrieval is not supported by this tool.")
    expect(output).not.toContain("retrieve the result")
  })

  it("wopal_cancel enforces ownership via current session", async () => {
    const manager = {
      cancel: vi.fn().mockResolvedValue("not_found"),
    }

    const execute = getExecute(createWopalCancelTool(manager as never))
    await expect(
      execute({ task_id: "task-1" }, { sessionID: "parent-2" }),
    ).resolves.toBe("Task not found for current session: task-1")
    expect(manager.cancel).toHaveBeenCalledWith("task-1", "parent-2")
  })

  it("wopal_cancel reports non-running tasks without masking final state", async () => {
    const manager = {
      cancel: vi.fn().mockResolvedValue("not_running"),
    }

    const execute = getExecute(createWopalCancelTool(manager as never))
    await expect(
      execute({ task_id: "task-1" }, { sessionID: "parent-1" }),
    ).resolves.toBe("Failed to cancel task-1: task is not running.")
  })
})
