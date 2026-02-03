/**
 * Message queue store — manages queued messages when agent is busy.
 */

import { create } from "zustand";

export interface QueuedMessage {
  id: string;
  text: string;
  attachments: unknown[];
  timestamp: number;
}

interface MessageQueueState {
  // Map from chatId to queued messages
  queues: Map<string, QueuedMessage[]>;

  // Add message to queue
  addToQueue: (chatId: string, text: string, attachments?: unknown[]) => void;

  // Remove message from queue
  removeFromQueue: (chatId: string, messageId: string) => void;

  // Clear all messages for a chat
  clearQueue: (chatId: string) => void;

  // Get queue for a chat
  getQueue: (chatId: string) => QueuedMessage[];

  // Get first message for a chat
  getFirstMessage: (chatId: string) => QueuedMessage | undefined;

  // Remove and return first message
  dequeue: (chatId: string) => QueuedMessage | undefined;
}

export const useMessageQueueStore = create<MessageQueueState>((set, get) => ({
  queues: new Map(),

  addToQueue: (chatId, text, attachments = []) => {
    set((state) => {
      const newQueues = new Map(state.queues);
      const queue = newQueues.get(chatId) || [];
      newQueues.set(chatId, [
        ...queue,
        {
          id: `q-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          text,
          attachments,
          timestamp: Date.now(),
        },
      ]);
      return { queues: newQueues };
    });
  },

  removeFromQueue: (chatId, messageId) => {
    set((state) => {
      const newQueues = new Map(state.queues);
      const queue = newQueues.get(chatId) || [];
      newQueues.set(
        chatId,
        queue.filter((m) => m.id !== messageId),
      );
      return { queues: newQueues };
    });
  },

  clearQueue: (chatId) => {
    set((state) => {
      const newQueues = new Map(state.queues);
      newQueues.set(chatId, []);
      return { queues: newQueues };
    });
  },

  getQueue: (chatId) => {
    return get().queues.get(chatId) || [];
  },

  getFirstMessage: (chatId) => {
    const queue = get().queues.get(chatId) || [];
    return queue[0];
  },

  dequeue: (chatId) => {
    const queue = get().queues.get(chatId) || [];
    if (queue.length === 0) return undefined;

    const first = queue[0];
    set((state) => {
      const newQueues = new Map(state.queues);
      newQueues.set(chatId, queue.slice(1));
      return { queues: newQueues };
    });
    return first;
  },
}));
