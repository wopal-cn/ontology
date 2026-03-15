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
  timeoutMs?: number
}

export interface LaunchInput {
  description: string
  prompt: string
  agent: string
  parentSessionID: string
  timeout?: number
}

// Session message types for result extraction
export interface SessionMessage {
  id?: string
  info?: {
    id?: string
    role?: string
    time?: string | { created?: number }
    finish?: string
    agent?: string
    model?: { providerID: string; modelID: string; variant?: string }
    modelID?: string
    providerID?: string
    variant?: string
  }
  parts?: Array<{
    type?: string
    text?: string
    tool?: string
    callID?: string
    content?: string | Array<{ type: string; text?: string }>
  }>
}

export interface MessagesResult {
  data?: SessionMessage[]
  error?: unknown
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
