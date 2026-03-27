import type { WopalTask } from "./types.js"

export const DEFAULT_STUCK_TIMEOUT_MS = 120_000 // 2 minutes

export interface StuckCheckConfig {
  stuckTimeoutMs: number
}

export interface StuckResult {
  task: WopalTask
  durationMs: number
}

export function checkStuckTasks(args: {
  tasks: Iterable<WopalTask>
  config: StuckCheckConfig
}): StuckResult[] {
  const { tasks, config } = args
  const now = Date.now()
  const results: StuckResult[] = []

  for (const task of tasks) {
    if (task.status !== "running") continue
    if (!task.startedAt || !task.sessionID) continue
    if (task.stuckNotified) continue

    const meaningfulActivity = task.progress?.lastMeaningfulActivity ?? task.startedAt
    const elapsed = now - meaningfulActivity.getTime()

    if (elapsed > config.stuckTimeoutMs) {
      results.push({ task, durationMs: elapsed })
    }
  }

  return results
}

export function clearStuckState(tasks: Iterable<WopalTask>): void {
  for (const task of tasks) {
    if (task.status !== "running") continue
    if (!task.stuckNotified || !task.stuckNotifiedAt) continue

    const meaningfulActivity = task.progress?.lastMeaningfulActivity
    if (meaningfulActivity && meaningfulActivity > task.stuckNotifiedAt) {
      task.stuckNotified = false
      delete task.stuckNotifiedAt
    }
  }
}
