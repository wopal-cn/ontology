import type { WopalTask } from "./types.js"

export const DEFAULT_STALE_TIMEOUT_MS = 180_000 // 3 minutes
export const DEFAULT_MESSAGE_STALENESS_TIMEOUT_MS = 1_800_000 // 30 minutes
export const MIN_RUNTIME_BEFORE_STALE_MS = 30_000 // 30 seconds

export interface StaleCheckConfig {
  staleTimeoutMs: number
  messageStalenessMs: number
  minRuntimeBeforeStaleMs: number
}

export interface SessionStatusInfo {
  type: string
}

export type SessionStatusMap = Record<string, SessionStatusInfo>

/**
 * Check for stale tasks and invoke callback for each stale task found.
 *
 * Two detection cases:
 * 1. No progress since start - task may be stuck
 * 2. Running but no recent progress update - task may be deadlocked
 */
export function checkAndInterruptStaleTasks(args: {
  tasks: Iterable<WopalTask>
  config: StaleCheckConfig
  sessionStatuses?: SessionStatusMap
  onStale: (task: WopalTask, reason: string) => Promise<void>
}): void {
  const { tasks, config, sessionStatuses, onStale } = args
  const now = Date.now()

  for (const task of tasks) {
    if (task.status !== "running") continue
    if (!task.startedAt || !task.sessionID) continue

    const sessionStatus = sessionStatuses?.[task.sessionID]?.type
    const sessionIsRunning =
      sessionStatus !== undefined && sessionStatus !== "idle"
    const runtime = now - task.startedAt.getTime()

    const staleTimeoutMs = task.staleTimeoutMs ?? config.staleTimeoutMs

    // Case 1: No progress update since start (possibly stuck)
    if (!task.progress?.lastUpdate) {
      if (sessionIsRunning) continue
      if (runtime <= config.messageStalenessMs) continue

      const staleMinutes = Math.round(runtime / 60000)
      void onStale(
        task,
        `no activity for ${staleMinutes}min since start`
      )
      continue
    }

    // Case 2: Running but stale progress
    if (sessionIsRunning) continue
    if (runtime < config.minRuntimeBeforeStaleMs) continue

    const timeSinceLastUpdate = now - task.progress.lastUpdate.getTime()
    if (timeSinceLastUpdate <= staleTimeoutMs) continue

    const staleMinutes = Math.round(timeSinceLastUpdate / 60000)
    void onStale(task, `no activity for ${staleMinutes}min`)
  }
}