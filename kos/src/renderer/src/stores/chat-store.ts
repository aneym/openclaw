import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Chat, ChatStatus } from "../types";

// Mock data per spec
const MOCK_CHATS: Chat[] = [
  {
    id: "chat-1",
    workspaceId: "ws-payme-auth",
    projectId: "proj-payme",
    sessionKey: "sess-1",
    title: "Implement OAuth flow",
    subtitle: "PAY-123: Auth integration",
    linkedTaskId: "task-1",
    status: "active",
    lastMessageAt: Date.now(),
    createdAt: Date.now() - 3600000,
  },
  {
    id: "chat-2",
    workspaceId: "ws-payme-auth",
    projectId: "proj-payme",
    sessionKey: "sess-2",
    title: "Fix token refresh bug",
    status: "idle",
    lastMessageAt: Date.now() - 3600000,
    createdAt: Date.now() - 7200000,
  },
  {
    id: "chat-3",
    workspaceId: "ws-payme-main",
    projectId: "proj-payme",
    sessionKey: "sess-3",
    title: "Deploy question",
    status: "active",
    lastMessageAt: Date.now() - 1800000,
    createdAt: Date.now() - 3600000,
  },
  {
    id: "chat-4",
    workspaceId: "ws-wedding-main",
    projectId: "proj-wedding",
    sessionKey: "sess-4",
    title: "Venue research",
    status: "active",
    lastMessageAt: Date.now() - 900000,
    createdAt: Date.now() - 1800000,
  },
  {
    id: "chat-5",
    workspaceId: "ws-kos-main",
    projectId: "proj-kos",
    sessionKey: "sess-5",
    title: "Panel system rewrite",
    subtitle: "KOS-8: Adaptive panels",
    status: "active",
    lastMessageAt: Date.now() - 300000,
    createdAt: Date.now() - 600000,
  },
  // Unassigned chats (no projectId or workspaceId)
  {
    id: "chat-unassigned-1",
    sessionKey: "sess-unassigned-1",
    title: "Quick Docker question",
    status: "active",
    lastMessageAt: Date.now() - 600000,
    createdAt: Date.now() - 900000,
  },
  {
    id: "chat-unassigned-2",
    sessionKey: "sess-unassigned-2",
    title: "Git rebase help",
    status: "idle",
    lastMessageAt: Date.now() - 2400000,
    createdAt: Date.now() - 3000000,
  },
  {
    id: "chat-unassigned-3",
    sessionKey: "sess-unassigned-3",
    title: "SSH key setup",
    status: "active",
    lastMessageAt: Date.now() - 120000,
    createdAt: Date.now() - 300000,
  },
];

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

  // Selectors
  getChat: (id: string) => Chat | undefined;
  getChatsForWorkspace: (workspaceId: string) => Chat[];
  getActiveChat: (workspaceId: string) => Chat | undefined;
  getActiveChatId: (workspaceId: string) => string | null;
  getAllChats: () => Chat[];
  getUnassignedChats: () => Chat[];
}

// Initialize with mock data
const initialChats = new Map<string, Chat>();
MOCK_CHATS.forEach((c) => initialChats.set(c.id, c));

// Set default active chat per workspace
const initialActiveByWorkspace = new Map<string, string>();
initialActiveByWorkspace.set("ws-payme-auth", "chat-1");
initialActiveByWorkspace.set("ws-payme-main", "chat-3");
initialActiveByWorkspace.set("ws-wedding-main", "chat-4");
initialActiveByWorkspace.set("ws-kos-main", "chat-5");

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
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

      mergeChats: (newChats: Chat[], isFullList: boolean) => {
        const { chats } = get();
        const updated = new Map(chats);
        const seenKeys = new Set<string>();

        for (const chat of newChats) {
          seenKeys.add(chat.sessionKey);
          const existing = Array.from(updated.values()).find(
            (c) => c.sessionKey === chat.sessionKey,
          );
          if (existing) {
            // Update existing chat
            updated.set(existing.id, {
              ...existing,
              title: chat.title || existing.title,
              lastMessageAt: Math.max(chat.lastMessageAt, existing.lastMessageAt),
              status: chat.status,
            });
          } else {
            // Add new chat
            updated.set(chat.id, chat);
          }
        }

        // Archive chats not in full list
        if (isFullList) {
          for (const chat of updated.values()) {
            if (!seenKeys.has(chat.sessionKey) && chat.status !== "archived") {
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
    }),
    {
      name: "kos-chats",
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name);
          if (!str) return null;
          const { state } = JSON.parse(str);
          return {
            state: {
              ...state,
              chats: new Map(state.chats || []),
              activeChatByWorkspace: new Map(state.activeChatByWorkspace || []),
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
