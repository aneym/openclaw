import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Chat, ChatStatus } from "../types";

// Mock data per spec
const MOCK_CHATS: Chat[] = [
  {
    id: "chat-1",
    workspaceId: "ws-payme-auth",
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
    sessionKey: "sess-2",
    title: "Fix token refresh bug",
    status: "idle",
    lastMessageAt: Date.now() - 3600000,
    createdAt: Date.now() - 7200000,
  },
  {
    id: "chat-3",
    workspaceId: "ws-payme-main",
    sessionKey: "sess-3",
    title: "Deploy question",
    status: "active",
    lastMessageAt: Date.now() - 1800000,
    createdAt: Date.now() - 3600000,
  },
  {
    id: "chat-4",
    workspaceId: "ws-wedding-main",
    sessionKey: "sess-4",
    title: "Venue research",
    status: "active",
    lastMessageAt: Date.now() - 900000,
    createdAt: Date.now() - 1800000,
  },
  {
    id: "chat-5",
    workspaceId: "ws-kos-main",
    sessionKey: "sess-5",
    title: "Panel system rewrite",
    subtitle: "KOS-8: Adaptive panels",
    status: "active",
    lastMessageAt: Date.now() - 300000,
    createdAt: Date.now() - 600000,
  },
];

interface ChatState {
  chats: Map<string, Chat>;
  // Map from workspaceId to active chatId
  activeChatByWorkspace: Map<string, string>;

  // Actions
  setActiveChat: (workspaceId: string, chatId: string | null) => void;
  addChat: (chat: Chat) => void;
  updateChat: (id: string, updates: Partial<Chat>) => void;
  archiveChat: (id: string) => void;
  deleteChat: (id: string) => void;

  // Selectors
  getChat: (id: string) => Chat | undefined;
  getChatsForWorkspace: (workspaceId: string) => Chat[];
  getActiveChat: (workspaceId: string) => Chat | undefined;
  getActiveChatId: (workspaceId: string) => string | null;
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

      setActiveChat: (workspaceId: string, chatId: string | null) => {
        const updated = new Map(get().activeChatByWorkspace);
        if (chatId) {
          const chat = get().chats.get(chatId);
          if (chat && chat.workspaceId === workspaceId) {
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

        // Make the new chat active
        const updatedActive = new Map(activeChatByWorkspace);
        updatedActive.set(chat.workspaceId, chat.id);

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

          // If this was the active chat, clear it
          const updatedActive = new Map(activeChatByWorkspace);
          if (updatedActive.get(chat.workspaceId) === id) {
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
        if (updatedActive.get(chat.workspaceId) === id) {
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
