export type WopalTaskStatus = 'pending' | 'running' | 'waiting' | 'completed' | 'error' | 'cancelled' | 'interrupt'

export type ErrorCategory = 'timeout' | 'crash' | 'network' | 'cancelled' | 'unknown'

export interface TaskProgress {
  toolCalls: number
  lastTool?: string
  lastUpdate: Date
  lastMessage?: string
  lastMessageAt?: Date
  lastMeaningfulActivity?: Date
}

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
  staleTimeoutMs?: number | undefined
  // Phase 3 additions
  startedAt?: Date
  progress?: TaskProgress
  errorCategory?: ErrorCategory
  concurrencyKey?: string | undefined
  // Progress notification tracking
  lastNotifyMessageCount?: number
  lastNotifyTime?: Date
  // Idle diagnostic fields
  waitingReason?: string
  lastAssistantMessage?: string
  // Stuck detection
  stuckNotified?: boolean
  stuckNotifiedAt?: Date
}

export interface LaunchInput {
  description: string
  prompt: string
  agent: string
  parentSessionID: string
  timeout?: number
  staleTimeout?: number
  abortSignal?: AbortSignal
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
