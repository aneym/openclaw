import { generateUUID } from './uuid'
import type { ChatAttachment, ChatQueueItem } from './ui-types'
import type { ToolStreamEntry } from './app-tool-stream'

export interface ThreadDescriptor {
  id: string
  sessionKey: string
  label: string
  createdAt: number
  lastActivityAt: number
  parentSessionKey: string
}

export interface ThreadState {
  descriptor: ThreadDescriptor
  chatMessages: unknown[]
  chatToolMessages: unknown[]
  chatStream: string | null
  chatStreamStartedAt: number | null
  chatRunId: string | null
  chatSending: boolean
  chatMessage: string
  chatAttachments: ChatAttachment[]
  chatQueue: ChatQueueItem[]
  chatLoading: boolean
  chatThinkingLevel: string | null
  toolStreamById: Map<string, ToolStreamEntry>
  toolStreamOrder: string[]
  toolStreamSyncTimer: number | null
  /** True while an async history load is in-flight for this thread. */
  _historyLoading: boolean
  unreadCount: number
  hasNewMessages: boolean
}

export function createThreadDescriptor(
  parentSessionKey: string,
  label?: string,
): ThreadDescriptor {
  const id = generateUUID()
  const now = Date.now()
  return {
    id,
    sessionKey: `${parentSessionKey}:thread:${id}`,
    label: label ?? 'New thread',
    createdAt: now,
    lastActivityAt: now,
    parentSessionKey,
  }
}

export function createThreadState(descriptor: ThreadDescriptor): ThreadState {
  return {
    descriptor,
    chatMessages: [],
    chatToolMessages: [],
    chatStream: null,
    chatStreamStartedAt: null,
    chatRunId: null,
    chatSending: false,
    chatMessage: '',
    chatAttachments: [],
    chatQueue: [],
    chatLoading: false,
    chatThinkingLevel: null,
    toolStreamById: new Map(),
    toolStreamOrder: [],
    toolStreamSyncTimer: null,
    _historyLoading: false,
    unreadCount: 0,
    hasNewMessages: false,
  }
}

type SnapshotHost = {
  chatMessages: unknown[]
  chatToolMessages: unknown[]
  chatStream: string | null
  chatStreamStartedAt: number | null
  chatRunId: string | null
  chatSending: boolean
  chatMessage: string
  chatAttachments: ChatAttachment[]
  chatQueue: ChatQueueItem[]
  chatLoading: boolean
  chatThinkingLevel: string | null
  toolStreamById: Map<string, ToolStreamEntry>
  toolStreamOrder: string[]
  toolStreamSyncTimer: number | null
}

export function snapshotThreadState(host: SnapshotHost): Omit<ThreadState, 'descriptor' | 'unreadCount' | 'hasNewMessages'> {
  return {
    chatMessages: host.chatMessages,
    chatToolMessages: host.chatToolMessages,
    chatStream: host.chatStream,
    chatStreamStartedAt: host.chatStreamStartedAt,
    chatRunId: host.chatRunId,
    chatSending: host.chatSending,
    chatMessage: host.chatMessage,
    chatAttachments: host.chatAttachments,
    chatQueue: host.chatQueue,
    chatLoading: host.chatLoading,
    chatThinkingLevel: host.chatThinkingLevel,
    toolStreamById: new Map(host.toolStreamById),
    toolStreamOrder: [...host.toolStreamOrder],
    toolStreamSyncTimer: host.toolStreamSyncTimer,
    _historyLoading: false,
  }
}

export function restoreThreadState(host: SnapshotHost, thread: ThreadState): void {
  host.chatMessages = thread.chatMessages
  host.chatToolMessages = thread.chatToolMessages
  host.chatStream = thread.chatStream
  host.chatStreamStartedAt = thread.chatStreamStartedAt
  host.chatRunId = thread.chatRunId
  host.chatSending = thread.chatSending
  host.chatMessage = thread.chatMessage
  host.chatAttachments = thread.chatAttachments
  host.chatQueue = thread.chatQueue
  host.chatLoading = thread.chatLoading
  host.chatThinkingLevel = thread.chatThinkingLevel
  host.toolStreamById = new Map(thread.toolStreamById)
  host.toolStreamOrder = [...thread.toolStreamOrder]
  host.toolStreamSyncTimer = thread.toolStreamSyncTimer
}
