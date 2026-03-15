import { beforeEach, describe, expect, it, vi } from "vitest"
import { SimpleTaskManager } from "./simple-task-manager.js"

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void

  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })

  return { promise, resolve, reject }
}

async function flushAsyncWork(iterations = 5) {
  for (let index = 0; index < iterations; index += 1) {
    await Promise.resolve()
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

function createMockClient() {
  return {
    session: {
      create: vi.fn().mockResolvedValue({ id: "child-session-1" }),
      promptAsync: vi.fn().mockResolvedValue(undefined),
      abort: vi.fn().mockResolvedValue(undefined),
    },
  }
}

describe("SimpleTaskManager", () => {
  let manager: SimpleTaskManager
  let mockClient: ReturnType<typeof createMockClient>
  const mockDebugLog = vi.fn()

  beforeEach(() => {
    mockClient = createMockClient()
    manager = new SimpleTaskManager(mockClient, "/test/dir", mockDebugLog)
    mockDebugLog.mockClear()
  })

  describe("launch", () => {
    it("creates a running task and child session", async () => {
      const result = await manager.launch({
        description: "Test task",
        prompt: "Do something",
        agent: "general",
        parentSessionID: "parent-1",
      })

      expect(result).toMatchObject({ ok: true, status: "running" })
      if (!result.ok) {
        throw new Error("expected successful launch")
      }

      expect(mockClient.session.create).toHaveBeenCalledWith({
        parentID: "parent-1",
        title: "Test task",
      })
      expect(mockClient.session.promptAsync).toHaveBeenCalledWith({
        path: { id: "child-session-1" },
        body: {
          agent: "general",
          parts: [{ type: "text", text: "Do something" }],
        },
      })

      const task = manager.getTask(result.taskId)
      expect(task?.status).toBe("running")
      expect(manager.findBySession("child-session-1")?.id).toBe(result.taskId)
    })

    it("extracts session id from session.data.id (OpenCode API structure)", async () => {
      mockClient.session.create.mockResolvedValueOnce({ data: { id: "session-from-data-id" } })

      const result = await manager.launch({
        description: "Test task",
        prompt: "Do something",
        agent: "general",
        parentSessionID: "parent-1",
      })

      expect(result).toMatchObject({ ok: true })
      if (!result.ok) throw new Error("expected success")

      expect(manager.findBySession("session-from-data-id")?.id).toBe(result.taskId)
    })

    it("extracts session id from session.id as fallback", async () => {
      mockClient.session.create.mockResolvedValueOnce({ id: "session-from-id" })

      const result = await manager.launch({
        description: "Test task",
        prompt: "Do something",
        agent: "general",
        parentSessionID: "parent-1",
      })

      expect(result).toMatchObject({ ok: true })
      if (!result.ok) throw new Error("expected success")

      expect(manager.findBySession("session-from-id")?.id).toBe(result.taskId)
    })

    it("fails when parent session id is missing", async () => {
      const result = await manager.launch({
        description: "Test task",
        prompt: "Do something",
        agent: "general",
        parentSessionID: "",
      })

      expect(result).toEqual({
        ok: false,
        status: "error",
        error: "Background task launch failed: parent session ID is required",
      })
    })

    it("fails when session.create is unavailable", async () => {
      const client = { session: { promptAsync: vi.fn(), abort: vi.fn() } }
      const failingManager = new SimpleTaskManager(client, "/test/dir", mockDebugLog)

      const result = await failingManager.launch({
        description: "Test task",
        prompt: "Do something",
        agent: "general",
        parentSessionID: "parent-1",
      })

      expect(result).toEqual({
        ok: false,
        status: "error",
        error: "Background task launch failed: session.create is unavailable",
      })
    })

    it("fails when session.create rejects", async () => {
      mockClient.session.create.mockRejectedValueOnce(new Error("Create failed"))

      const result = await manager.launch({
        description: "Test task",
        prompt: "Do something",
        agent: "general",
        parentSessionID: "parent-1",
      })

      expect(result).toMatchObject({
        ok: false,
        status: "error",
        error: "Background task launch failed: Create failed",
      })
      if (result.ok || !result.taskId) {
        throw new Error("expected failed launch with task id")
      }

      expect(manager.getTask(result.taskId)?.status).toBe("error")
    })

    it("fails when child session id is missing", async () => {
      mockClient.session.create.mockResolvedValueOnce({ info: {} })

      const result = await manager.launch({
        description: "Test task",
        prompt: "Do something",
        agent: "general",
        parentSessionID: "parent-1",
      })

      expect(result).toMatchObject({
        ok: false,
        status: "error",
        error: "Background task launch failed: child session did not provide an ID",
      })
    })

    it("fails when session.promptAsync is unavailable", async () => {
      const client = {
        session: {
          create: vi.fn().mockResolvedValue({ id: "child-session-1" }),
          abort: vi.fn().mockResolvedValue(undefined),
        },
      }
      const failingManager = new SimpleTaskManager(client, "/test/dir", mockDebugLog)

      const result = await failingManager.launch({
        description: "Test task",
        prompt: "Do something",
        agent: "general",
        parentSessionID: "parent-1",
      })

      expect(result).toMatchObject({
        ok: false,
        status: "error",
        error: "Background task launch failed: session.promptAsync is unavailable",
      })
      expect(client.session.abort).toHaveBeenCalledWith({
        path: { id: "child-session-1" },
      })
    })

    it("fails when session.promptAsync does not return a promise", async () => {
      mockClient.session.promptAsync.mockReturnValueOnce(undefined)

      const result = await manager.launch({
        description: "Test task",
        prompt: "Do something",
        agent: "general",
        parentSessionID: "parent-1",
      })

      expect(result).toMatchObject({
        ok: false,
        status: "error",
        error:
          "Background task launch failed: session.promptAsync did not return a promise",
      })
      expect(mockClient.session.abort).toHaveBeenCalledWith({
        path: { id: "child-session-1" },
      })
    })

    it("marks task as error when promptAsync later rejects", async () => {
      const deferred = createDeferred<void>()
      mockClient.session.promptAsync.mockReturnValueOnce(deferred.promise)

      const result = await manager.launch({
        description: "Test task",
        prompt: "Do something",
        agent: "general",
        parentSessionID: "parent-1",
      })

      if (!result.ok) {
        throw new Error("expected successful launch")
      }

      deferred.reject(new Error("Prompt failed"))
      await flushAsyncWork()

      const task = manager.getTask(result.taskId)
      expect(task?.status).toBe("error")
      expect(task?.error).toBe("Background task execution failed: Prompt failed")

      expect(mockClient.session.abort).toHaveBeenCalledWith({
        path: { id: "child-session-1" },
      })
    })
  })

  describe("ownership", () => {
    it("returns task only to owning parent session", async () => {
      const result = await manager.launch({
        description: "Test task",
        prompt: "Do something",
        agent: "general",
        parentSessionID: "parent-1",
      })

      if (!result.ok) {
        throw new Error("expected successful launch")
      }

      expect(manager.getTaskForParent(result.taskId, "parent-1")?.id).toBe(result.taskId)
      expect(manager.getTaskForParent(result.taskId, "parent-2")).toBeUndefined()
    })
  })

  describe("cancel", () => {
    it("aborts session and marks cancelled", async () => {
      const result = await manager.launch({
        description: "Test task",
        prompt: "Do something",
        agent: "general",
        parentSessionID: "parent-1",
      })

      if (!result.ok) {
        throw new Error("expected successful launch")
      }

      const cancelled = await manager.cancel(result.taskId, "parent-1")

      expect(cancelled).toBe("cancelled")
      expect(mockClient.session.abort).toHaveBeenCalledWith({
        path: { id: "child-session-1" },
      })
      expect(manager.getTask(result.taskId)?.status).toBe("cancelled")
    })

    it("returns abort_failed when session.abort rejects", async () => {
      mockClient.session.abort.mockRejectedValueOnce(new Error("Abort failed"))

      const result = await manager.launch({
        description: "Test task",
        prompt: "Do something",
        agent: "general",
        parentSessionID: "parent-1",
      })

      if (!result.ok) {
        throw new Error("expected successful launch")
      }

      const cancelled = await manager.cancel(result.taskId, "parent-1")

      expect(cancelled).toBe("abort_failed")
      expect(manager.getTask(result.taskId)?.status).toBe("running")
    })

    it("rejects cancellation from a different parent session", async () => {
      const result = await manager.launch({
        description: "Test task",
        prompt: "Do something",
        agent: "general",
        parentSessionID: "parent-1",
      })

      if (!result.ok) {
        throw new Error("expected successful launch")
      }

      await expect(manager.cancel(result.taskId, "parent-2")).resolves.toBe("not_found")
      expect(mockClient.session.abort).not.toHaveBeenCalled()
    })

    it("does not overwrite a task completed during abort race", async () => {
      const abortDeferred = createDeferred<void>()
      mockClient.session.abort.mockReturnValueOnce(abortDeferred.promise)

      const result = await manager.launch({
        description: "Test task",
        prompt: "Do something",
        agent: "general",
        parentSessionID: "parent-1",
      })

      if (!result.ok) {
        throw new Error("expected successful launch")
      }

      const cancelPromise = manager.cancel(result.taskId, "parent-1")
      manager.markTaskCompletedBySession("child-session-1")
      abortDeferred.resolve(undefined)

      await expect(cancelPromise).resolves.toBe("not_running")
      expect(manager.getTask(result.taskId)?.status).toBe("completed")
    })

    it("does not overwrite a task errored during abort race", async () => {
      const abortDeferred = createDeferred<void>()
      mockClient.session.abort.mockReturnValueOnce(abortDeferred.promise)

      const result = await manager.launch({
        description: "Test task",
        prompt: "Do something",
        agent: "general",
        parentSessionID: "parent-1",
      })

      if (!result.ok) {
        throw new Error("expected successful launch")
      }

      const cancelPromise = manager.cancel(result.taskId, "parent-1")
      manager.markTaskErrorBySession("child-session-1", "Session failed")
      abortDeferred.resolve(undefined)

      await expect(cancelPromise).resolves.toBe("not_running")
      expect(manager.getTask(result.taskId)?.status).toBe("error")
      expect(manager.getTask(result.taskId)?.error).toBe("Session failed")
    })
  })

  describe("notifyParent", () => {
    it("sends no-reply notification with updated status wording", async () => {
      const result = await manager.launch({
        description: "Test task",
        prompt: "Do something",
        agent: "general",
        parentSessionID: "parent-1",
      })

      if (!result.ok) {
        throw new Error("expected successful launch")
      }

      await manager.notifyParent(result.taskId)

      const call = mockClient.session.promptAsync.mock.calls.find(
        (entry) => entry[0]?.body?.noReply === true,
      )
      const notification = call?.[0]?.body?.parts?.[0]?.text as string

      expect(notification).toContain(result.taskId)
      expect(notification).toContain("Use \`wopal_output")
      expect(notification).toContain("Result retrieval is not supported by this tool.")
    })
  })

  describe("cleanup", () => {
    it("removes old completed tasks", async () => {
      const result = await manager.launch({
        description: "Test task",
        prompt: "Do something",
        agent: "general",
        parentSessionID: "parent-1",
      })

      if (!result.ok) {
        throw new Error("expected successful launch")
      }

      const task = manager.getTask(result.taskId)
      if (!task) {
        throw new Error("expected task")
      }

      task.status = "completed"
      task.completedAt = new Date(Date.now() - 4_000_000)

      manager.cleanup(3_600_000)

      expect(manager.getTask(result.taskId)).toBeUndefined()
    })

    it("keeps recent tasks", async () => {
      const result = await manager.launch({
        description: "Test task",
        prompt: "Do something",
        agent: "general",
        parentSessionID: "parent-1",
      })

      if (!result.ok) {
        throw new Error("expected successful launch")
      }

      const task = manager.getTask(result.taskId)
      if (!task) {
        throw new Error("expected task")
      }

      task.status = "completed"
      task.completedAt = new Date(Date.now() - 1_000)

      manager.cleanup(3_600_000)

      expect(manager.getTask(result.taskId)).toBeDefined()
    })
  })
})
