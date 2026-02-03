/**
 * Message queue store — manages queued messages when agent is busy.
 */

import { create } from 'zustand'

export interface QueuedMessage {
  id: string
  text: string
  attachments: unknown[]
  timestamp: number
}

interface MessageQueueState {
  // Map from threadId to queued messages
  queues: Map<string, QueuedMessage[]>

  // Add message to queue
  addToQueue: (threadId: string, text: string, attachments?: unknown[]) => void

  // Remove message from queue
  removeFromQueue: (threadId: string, messageId: string) => void

  // Clear all messages for a thread
  clearQueue: (threadId: string) => void

  // Get queue for a thread
  getQueue: (threadId: string) => QueuedMessage[]

  // Get first message for a thread
  getFirstMessage: (threadId: string) => QueuedMessage | undefined

  // Remove and return first message
  dequeue: (threadId: string) => QueuedMessage | undefined
}

export const useMessageQueueStore = create<MessageQueueState>((set, get) => ({
  queues: new Map(),

  addToQueue: (threadId, text, attachments = []) => {
    set((state) => {
      const newQueues = new Map(state.queues)
      const queue = newQueues.get(threadId) || []
      newQueues.set(threadId, [
        ...queue,
        {
          id: `q-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          text,
          attachments,
          timestamp: Date.now()
        }
      ])
      return { queues: newQueues }
    })
  },

  removeFromQueue: (threadId, messageId) => {
    set((state) => {
      const newQueues = new Map(state.queues)
      const queue = newQueues.get(threadId) || []
      newQueues.set(
        threadId,
        queue.filter((m) => m.id !== messageId)
      )
      return { queues: newQueues }
    })
  },

  clearQueue: (threadId) => {
    set((state) => {
      const newQueues = new Map(state.queues)
      newQueues.set(threadId, [])
      return { queues: newQueues }
    })
  },

  getQueue: (threadId) => {
    return get().queues.get(threadId) || []
  },

  getFirstMessage: (threadId) => {
    const queue = get().queues.get(threadId) || []
    return queue[0]
  },

  dequeue: (threadId) => {
    const queue = get().queues.get(threadId) || []
    if (queue.length === 0) return undefined

    const first = queue[0]
    set((state) => {
      const newQueues = new Map(state.queues)
      newQueues.set(threadId, queue.slice(1))
      return { queues: newQueues }
    })
    return first
  }
}))
