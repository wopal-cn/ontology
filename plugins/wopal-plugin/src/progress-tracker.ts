import type { WopalTask } from "./types.js"

const MEANINGFUL_PART_TYPES = new Set(["tool", "text"])

export function isMeaningfulActivity(partType: string | undefined): boolean {
  return MEANINGFUL_PART_TYPES.has(partType ?? "")
}

export function trackActivity(task: WopalTask, partType: string | undefined): boolean {
  if (!isMeaningfulActivity(partType)) return false
  if (!task.progress) return false

  const now = new Date()
  task.progress.lastMeaningfulActivity = now
  task.progress.lastUpdate = now

  if (partType === "tool") {
    task.progress.toolCalls++
  }

  return true
}
