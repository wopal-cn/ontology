export type WopalTaskStatus = 'pending' | 'running' | 'completed' | 'error' | 'cancelled'

export interface WopalTask {
  id: string
  sessionID?: string
  status: WopalTaskStatus
  description: string
  agent: string
  prompt: string
  parentSessionID: string
  createdAt: Date
  completedAt?: Date
  error?: string
}

export interface LaunchInput {
  description: string
  prompt: string
  agent: string
  parentSessionID: string
}

export interface LaunchSuccess {
  ok: true
  taskId: string
  status: 'running'
}

export interface LaunchFailure {
  ok: false
  taskId?: string
  status: 'error'
  error: string
}

export type LaunchOutput = LaunchSuccess | LaunchFailure

export type CancelResult =
  | 'cancelled'
  | 'not_found'
  | 'not_running'
  | 'abort_failed'
