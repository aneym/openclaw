import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Chat, ChatStatus } from "../types";
import { sessionKeysMatch } from "../lib/session-keys";

interface ChatState {
  chats: Map<string, Chat>;
  // Map from workspaceId to active chatId
  activeChatByWorkspace: Map<string, string>;
  // Pagination state
  hasMore: boolean;
  isLoadingMore: boolean;

  // Actions
  setActiveChat: (workspaceId: string, chatId: string | null) => void;
  addChat: (chat: Chat) => void;
  updateChat: (id: string, updates: Partial<Chat>) => void;
  archiveChat: (id: string) => void;
  unarchiveChat: (id: string) => void;
  deleteChat: (id: string) => void;
  assignChatToProject: (chatId: string, projectId: string | null) => void;
  // Pagination actions
  setHasMore: (hasMore: boolean) => void;
  setLoadingMore: (loading: boolean) => void;
  /**
   * Merge chats from gateway.
   * @param chats - Chats to merge
   * @param isFullList - If true, archive chats not in this list
   */
  mergeChats: (chats: Chat[], isFullList: boolean) => void;

  // Unread actions
  markUnread: (chatId: string) => void;
  markRead: (chatId: string) => void;
  getUnreadCount: () => number;

  // Selectors
  getChat: (id: string) => Chat | undefined;
  getChatsForWorkspace: (workspaceId: string) => Chat[];
  getActiveChat: (workspaceId: string) => Chat | undefined;
  getActiveChatId: (workspaceId: string) => string | null;
  getAllChats: () => Chat[];
  getUnassignedChats: () => Chat[];
}

// Initialize empty — chats are populated from gateway via session sync
const initialChats = new Map<string, Chat>();

// Active chat per workspace — populated as user selects chats
const initialActiveByWorkspace = new Map<string, string>();

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => {
      // Debug: Track initial state
      console.log("[chat-store] Store initializing");

      return {
        chats: initialChats,
        activeChatByWorkspace: initialActiveByWorkspace,
        hasMore: true,
        isLoadingMore: false,

        setActiveChat: (workspaceId: string, chatId: string | null) => {
          const updated = new Map(get().activeChatByWorkspace);
          if (chatId) {
            const chat = get().chats.get(chatId);
            // Allow setting active if chat exists and either:
            // 1. Chat's workspaceId matches the target workspace, or
            // 2. Chat has no workspaceId (will be assigned by caller)
            if (chat && (chat.workspaceId === workspaceId || !chat.workspaceId)) {
              updated.set(workspaceId, chatId);
            }
          } else {
            updated.delete(workspaceId);
          }
          set({ activeChatByWorkspace: updated });
        },

        addChat: (chat: Chat) => {
          const { chats, activeChatByWorkspace } = get();
          const updated = new Map(chats);
          updated.set(chat.id, chat);

          // Make the new chat active (only if it has a workspaceId)
          const updatedActive = new Map(activeChatByWorkspace);
          if (chat.workspaceId) {
            updatedActive.set(chat.workspaceId, chat.id);
          }

          set({ chats: updated, activeChatByWorkspace: updatedActive });
        },

        updateChat: (id: string, updates: Partial<Chat>) => {
          const { chats } = get();
          const chat = chats.get(id);
          if (chat) {
            const updated = new Map(chats);
            updated.set(id, { ...chat, ...updates });
            set({ chats: updated });
          }
        },

        archiveChat: (id: string) => {
          const { chats, activeChatByWorkspace } = get();
          const chat = chats.get(id);
          if (chat) {
            const updated = new Map(chats);
            updated.set(id, { ...chat, status: "archived" as ChatStatus });

            // If this was the active chat, clear it (only if chat has workspaceId)
            const updatedActive = new Map(activeChatByWorkspace);
            if (chat.workspaceId && updatedActive.get(chat.workspaceId) === id) {
              // Find another chat to make active
              const otherChats = Array.from(updated.values()).filter(
                (c) => c.workspaceId === chat.workspaceId && c.status !== "archived" && c.id !== id,
              );
              if (otherChats.length > 0) {
                otherChats.sort((a, b) => b.lastMessageAt - a.lastMessageAt);
                updatedActive.set(chat.workspaceId, otherChats[0].id);
              } else {
                updatedActive.delete(chat.workspaceId);
              }
            }

            set({ chats: updated, activeChatByWorkspace: updatedActive });
          }
        },

        unarchiveChat: (id: string) => {
          const { chats } = get();
          const chat = chats.get(id);
          if (chat && chat.status === "archived") {
            const updated = new Map(chats);
            updated.set(id, { ...chat, status: "active" as ChatStatus });
            set({ chats: updated });
          }
        },

        deleteChat: (id: string) => {
          const { chats, activeChatByWorkspace } = get();
          const chat = chats.get(id);
          if (!chat) return;

          const updated = new Map(chats);
          updated.delete(id);

          const updatedActive = new Map(activeChatByWorkspace);
          if (chat.workspaceId && updatedActive.get(chat.workspaceId) === id) {
            const otherChats = Array.from(updated.values()).filter(
              (c) => c.workspaceId === chat.workspaceId && c.status !== "archived",
            );
            if (otherChats.length > 0) {
              otherChats.sort((a, b) => b.lastMessageAt - a.lastMessageAt);
              updatedActive.set(chat.workspaceId, otherChats[0].id);
            } else {
              updatedActive.delete(chat.workspaceId);
            }
          }

          set({ chats: updated, activeChatByWorkspace: updatedActive });
        },

        assignChatToProject: (chatId: string, projectId: string | null) => {
          const { chats } = get();
          const chat = chats.get(chatId);
          if (chat) {
            const updated = new Map(chats);
            updated.set(chatId, {
              ...chat,
              projectId: projectId ?? undefined,
            });
            set({ chats: updated });
          }
        },

        setHasMore: (hasMore: boolean) => {
          set({ hasMore });
        },

        setLoadingMore: (loading: boolean) => {
          set({ isLoadingMore: loading });
        },

        markUnread: (chatId: string) => {
          const { chats } = get();
          const chat = chats.get(chatId);
          if (chat && !chat.hasUnread) {
            const updated = new Map(chats);
            updated.set(chatId, { ...chat, hasUnread: true });
            set({ chats: updated });
          }
        },

        markRead: (chatId: string) => {
          const { chats } = get();
          const chat = chats.get(chatId);
          if (chat && chat.hasUnread) {
            const updated = new Map(chats);
            updated.set(chatId, { ...chat, hasUnread: false });
            set({ chats: updated });
          }
        },

        getUnreadCount: () => {
          let count = 0;
          for (const chat of get().chats.values()) {
            if (chat.hasUnread && !chat.isCron) count++;
          }
          return count;
        },

        mergeChats: (newChats: Chat[], isFullList: boolean) => {
          const { chats } = get();
          const updated = new Map(chats);
          const seenKeys = new Set<string>();

          for (const chat of newChats) {
            seenKeys.add(chat.sessionKey);
            const existing = Array.from(updated.values()).find((c) =>
              sessionKeysMatch(c.sessionKey, chat.sessionKey),
            );
            if (existing) {
              // Update existing chat (preserve hasUnread — gateway doesn't know about it)
              updated.set(existing.id, {
                ...existing,
                title: chat.title || existing.title,
                lastMessageAt: Math.max(chat.lastMessageAt, existing.lastMessageAt),
                status: chat.status,
                hasUnread: existing.hasUnread,
              });
            } else {
              // Add new chat
              updated.set(chat.id, chat);
            }
          }

          // Archive chats not in full list
          if (isFullList) {
            for (const chat of updated.values()) {
              const isSeen = Array.from(seenKeys).some((key) =>
                sessionKeysMatch(key, chat.sessionKey),
              );
              if (!isSeen && chat.status !== "archived") {
                updated.set(chat.id, { ...chat, status: "archived" as ChatStatus });
              }
            }
          }

          set({ chats: updated });
        },

        getChat: (id: string) => {
          return get().chats.get(id);
        },

        getChatsForWorkspace: (workspaceId: string) => {
          return Array.from(get().chats.values())
            .filter((c) => c.workspaceId === workspaceId && c.status !== "archived")
            .sort((a, b) => b.lastMessageAt - a.lastMessageAt);
        },

        getActiveChat: (workspaceId: string) => {
          const { chats, activeChatByWorkspace } = get();
          const activeId = activeChatByWorkspace.get(workspaceId);
          return activeId ? chats.get(activeId) : undefined;
        },

        getActiveChatId: (workspaceId: string) => {
          return get().activeChatByWorkspace.get(workspaceId) ?? null;
        },

        getAllChats: () => {
          return Array.from(get().chats.values()).sort((a, b) => b.lastMessageAt - a.lastMessageAt);
        },

        getUnassignedChats: () => {
          return Array.from(get().chats.values())
            .filter((c) => !c.projectId)
            .sort((a, b) => b.lastMessageAt - a.lastMessageAt);
        },
      };
    },
    {
      name: "kos-chats",
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name);
          console.log("[chat-store] getItem called, has data:", !!str);
          if (!str) return null;
          const { state } = JSON.parse(str);
          const chatsMap = new Map(state.chats || []);
          const activeMap = new Map(state.activeChatByWorkspace || []);
          console.log("[chat-store] Hydrating from localStorage:", {
            chatsCount: chatsMap.size,
            activeChatByWorkspaceCount: activeMap.size,
            chatIds: Array.from(chatsMap.keys()).slice(0, 5),
            activeEntries: Array.from(activeMap.entries()),
          });
          return {
            state: {
              ...state,
              chats: chatsMap,
              activeChatByWorkspace: activeMap,
            },
          };
        },
        setItem: (name, value) => {
          const { state } = value;
          localStorage.setItem(
            name,
            JSON.stringify({
              state: {
                ...state,
                chats: Array.from(state.chats.entries()),
                activeChatByWorkspace: Array.from(state.activeChatByWorkspace.entries()),
              },
            }),
          );
        },
        removeItem: (name) => localStorage.removeItem(name),
      },
    },
  ),
);
