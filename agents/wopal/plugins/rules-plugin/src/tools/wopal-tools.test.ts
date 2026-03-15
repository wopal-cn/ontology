import { describe, expect, it, vi } from "vitest"
import { createWopalCancelTool } from "./wopal-cancel.js"
import { createWopalOutputTool } from "./wopal-output.js"
import { createWopalTaskTool } from "./wopal-task.js"

function getExecute(toolDefinition: unknown) {
  return (toolDefinition as { execute: (...args: unknown[]) => Promise<string> }).execute
}

describe("wopal tools", () => {
  describe("wopal_task", () => {
    it("fails when context session id is missing", async () => {
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

    it("surfaces launch failures", async () => {
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

    it("returns task id on success", async () => {
      const manager = {
        launch: vi.fn().mockResolvedValue({
          ok: true,
          taskId: "task-123",
          status: "running",
        }),
      }

      const execute = getExecute(createWopalTaskTool(manager as never))
      const result = await execute(
        { description: "Test task", prompt: "Do something" },
        { sessionID: "parent-1" },
      )

      expect(result).toContain("task-123")
      expect(result).toContain("running")
      expect(manager.launch).toHaveBeenCalledWith({
        description: "Test task",
        prompt: expect.stringContaining("Do something"),
        agent: "general",
        parentSessionID: "parent-1",
      })
    })

    it("uses default agent when not specified", async () => {
      const manager = {
        launch: vi.fn().mockResolvedValue({
          ok: true,
          taskId: "task-1",
          status: "running",
        }),
      }

      const execute = getExecute(createWopalTaskTool(manager as never))
      await execute(
        { description: "Test task", prompt: "Do something" },
        { sessionID: "parent-1" },
      )

      expect(manager.launch).toHaveBeenCalledWith(
        expect.objectContaining({ agent: "general" }),
      )
    })

    it("appends report template to prompt", async () => {
      const manager = {
        launch: vi.fn().mockResolvedValue({
          ok: true,
          taskId: "task-1",
          status: "running",
        }),
      }

      const execute = getExecute(createWopalTaskTool(manager as never))
      await execute(
        { description: "Test task", prompt: "Do something" },
        { sessionID: "parent-1" },
      )

      const callArgs = manager.launch.mock.calls[0][0]
      expect(callArgs.prompt).toContain("Do something")
      expect(callArgs.prompt).toContain("[MANDATORY - Include this report at the end of your response]")
      expect(callArgs.prompt).toContain("## Task Report")
      expect(callArgs.prompt).toContain("**Summary**:")
      expect(callArgs.prompt).toContain("**Files**:")
    })
  })

  describe("wopal_output", () => {
    it("enforces ownership via current session", async () => {
      const manager = {
        getTaskForParent: vi.fn().mockReturnValue(undefined),
      }

      const execute = getExecute(createWopalOutputTool(manager as never))
      await expect(
        execute({ task_id: "task-1" }, { sessionID: "parent-2" }),
      ).resolves.toBe("Task not found for current session: task-1")
      expect(manager.getTaskForParent).toHaveBeenCalledWith("task-1", "parent-2")
    })

    it("describes completed tasks", async () => {
      const manager = {
        getTaskForParent: vi.fn().mockReturnValue({
          id: "task-1",
          sessionID: "session-1",
          status: "completed",
          description: "Test task",
          agent: "general",
          completedAt: new Date("2026-03-15T10:00:00.000Z"),
        }),
        getClient: vi.fn().mockReturnValue({
          session: {
            messages: vi.fn().mockResolvedValue({
              data: [
                { info: { role: "assistant" }, parts: [{ type: "text", text: "Task output" }] },
              ],
            }),
          },
        }),
      }

      const execute = getExecute(createWopalOutputTool(manager as never))
      const output = await execute({ task_id: "task-1" }, { sessionID: "parent-1" })

      expect(output).toContain("**Status:** completed")
      expect(output).toContain("Task output")
    })

    it("describes running tasks", async () => {
      const manager = {
        getTaskForParent: vi.fn().mockReturnValue({
          id: "task-1",
          status: "running",
          description: "Test task",
          agent: "general",
        }),
      }

      const execute = getExecute(createWopalOutputTool(manager as never))
      const output = await execute({ task_id: "task-1" }, { sessionID: "parent-1" })

      expect(output).toContain("**Status:** running")
      expect(output).toContain("still running")
    })

    it("describes error tasks with error message", async () => {
      const manager = {
        getTaskForParent: vi.fn().mockReturnValue({
          id: "task-1",
          status: "error",
          description: "Test task",
          agent: "general",
          error: "Something went wrong",
        }),
      }

      const execute = getExecute(createWopalOutputTool(manager as never))
      const output = await execute({ task_id: "task-1" }, { sessionID: "parent-1" })

      expect(output).toContain("**Status:** error")
      expect(output).toContain("Error: Something went wrong")
    })

    it("describes cancelled tasks", async () => {
      const manager = {
        getTaskForParent: vi.fn().mockReturnValue({
          id: "task-1",
          status: "cancelled",
          description: "Test task",
          agent: "general",
          completedAt: new Date("2026-03-15T10:00:00.000Z"),
        }),
      }

      const execute = getExecute(createWopalOutputTool(manager as never))
      const output = await execute({ task_id: "task-1" }, { sessionID: "parent-1" })

      expect(output).toContain("**Status:** cancelled")
      expect(output).toContain("was cancelled")
    })

    it("fails when context session id is missing", async () => {
      const manager = {
        getTaskForParent: vi.fn(),
      }

      const execute = getExecute(createWopalOutputTool(manager as never))
      await expect(
        execute({ task_id: "task-1" }, {}),
      ).resolves.toBe("Current session ID is unavailable; cannot read task status.")
      expect(manager.getTaskForParent).not.toHaveBeenCalled()
    })
  })

  describe("wopal_cancel", () => {
    it("enforces ownership via current session", async () => {
      const manager = {
        cancel: vi.fn().mockResolvedValue("not_found"),
      }

      const execute = getExecute(createWopalCancelTool(manager as never))
      await expect(
        execute({ task_id: "task-1" }, { sessionID: "parent-2" }),
      ).resolves.toBe("Task not found for current session: task-1")
      expect(manager.cancel).toHaveBeenCalledWith("task-1", "parent-2")
    })

    it("reports successful cancellation", async () => {
      const manager = {
        cancel: vi.fn().mockResolvedValue("cancelled"),
      }

      const execute = getExecute(createWopalCancelTool(manager as never))
      const result = await execute({ task_id: "task-1" }, { sessionID: "parent-1" })

      expect(result).toBe("Task task-1 cancelled.")
    })

    it("reports abort_failed", async () => {
      const manager = {
        cancel: vi.fn().mockResolvedValue("abort_failed"),
      }

      const execute = getExecute(createWopalCancelTool(manager as never))
      const result = await execute({ task_id: "task-1" }, { sessionID: "parent-1" })

      expect(result).toBe("Failed to cancel task-1: backend abort request failed.")
    })

    it("reports not_running", async () => {
      const manager = {
        cancel: vi.fn().mockResolvedValue("not_running"),
      }

      const execute = getExecute(createWopalCancelTool(manager as never))
      const result = await execute({ task_id: "task-1" }, { sessionID: "parent-1" })

      expect(result).toBe("Failed to cancel task-1: task is not running.")
    })

    it("fails when context session id is missing", async () => {
      const manager = {
        cancel: vi.fn(),
      }

      const execute = getExecute(createWopalCancelTool(manager as never))
      await expect(
        execute({ task_id: "task-1" }, {}),
      ).resolves.toBe("Current session ID is unavailable; cannot cancel task.")
      expect(manager.cancel).not.toHaveBeenCalled()
    })
  })
})
