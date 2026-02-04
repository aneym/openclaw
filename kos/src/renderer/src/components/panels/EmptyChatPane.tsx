/**
 * EmptyChatPane
 *
 * Shown when a chat panel has no chatId assigned.
 * Displays recent sessions to pick from, plus an input to start a new conversation.
 */

import { MessageSquare, Clock, Send } from "lucide-react";
import { useMemo, useCallback, useState, useRef, useEffect } from "react";
import type { Chat } from "../../types";
import { cn } from "../../lib/utils";
import { useChatStore } from "../../stores/chat-store";
import { useGatewayStore } from "../../stores/gateway-store";
import { usePanelStore } from "../../stores/panel-store";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";

interface EmptyChatPaneProps {
  workspaceId: string;
  panelId: string;
  /** IDs of chats already open in other panes (to exclude from picker) */
  openChatIds?: Set<string>;
}

export function EmptyChatPane({ workspaceId, panelId, openChatIds }: EmptyChatPaneProps) {
  const chatsMap = useChatStore((s) => s.chats);
  const addChat = useChatStore((s) => s.addChat);
  const setActiveChat = useChatStore((s) => s.setActiveChat);
  const openThreadInPane = usePanelStore((s) => s.openThreadInPane);
  const request = useGatewayStore((s) => s.request);

  const [text, setText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Focus the textarea on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Get recent chats, excluding already-open ones and archived
  const recentChats = useMemo(() => {
    const allChats = Array.from(chatsMap.values() as Iterable<Chat>)
      .filter((c) => {
        if (c.status === "archived") return false;
        if (openChatIds?.has(c.id)) return false;
        return true;
      })
      .sort((a, b) => b.lastMessageAt - a.lastMessageAt)
      .slice(0, 8); // Show up to 8 recent sessions
    return allChats;
  }, [chatsMap, openChatIds]);

  const handleSelectChat = useCallback(
    (chat: Chat) => {
      openThreadInPane(workspaceId, panelId, chat.id);
      if (chat.workspaceId) {
        setActiveChat(chat.workspaceId, chat.id);
      }
    },
    [workspaceId, panelId, openThreadInPane, setActiveChat],
  );

  const handleSend = useCallback(async () => {
    const messageText = text.trim();
    if (!messageText || isSending) return;

    setIsSending(true);

    // Create a new chat with a new sessionKey
    const uuid = crypto.randomUUID();
    const sessionKey = `kos:thread:${uuid}`;
    const now = Date.now();

    const newChat: Chat = {
      id: `chat-${now}`,
      workspaceId,
      sessionKey,
      title: messageText.slice(0, 50) || "New Chat",
      status: "active",
      lastMessageAt: now,
      createdAt: now,
    };

    // Add the chat and open it in this pane
    addChat(newChat);
    openThreadInPane(workspaceId, panelId, newChat.id);
    setActiveChat(workspaceId, newChat.id);

    // Clear the input (the pane will switch to ChatPanel)
    setText("");

    // Send the message to the gateway with the NEW sessionKey
    try {
      await request("chat.send", {
        sessionKey,
        message: messageText,
        deliver: false,
        idempotencyKey: `msg-${now}`,
      });
    } catch (err) {
      console.error("[EmptyChatPane] Failed to send message:", err);
    }

    setIsSending(false);
  }, [text, isSending, workspaceId, panelId, addChat, openThreadInPane, setActiveChat, request]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  return (
    <div className="flex flex-col h-full">
      {/* Session picker */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-md mx-auto">
          <h3 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            Open a recent session
          </h3>

          {recentChats.length > 0 ? (
            <div className="space-y-1">
              {recentChats.map((chat) => (
                <button
                  key={chat.id}
                  onClick={() => handleSelectChat(chat)}
                  className={cn(
                    "w-full px-3 py-2 rounded-md text-left transition-colors",
                    "flex items-center gap-3",
                    "text-muted-foreground hover:text-foreground hover:bg-accent/50",
                  )}
                >
                  <MessageSquare className="h-4 w-4 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{chat.title}</div>
                    {chat.subtitle && (
                      <div className="text-xs text-muted-foreground/70 truncate">
                        {chat.subtitle}
                      </div>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground/50 shrink-0">
                    {formatTimeAgo(chat.lastMessageAt)}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground/70 text-center py-4">
              No other sessions available
            </p>
          )}

          <p className="text-xs text-muted-foreground/50 text-center mt-4">
            Or start a new conversation below
          </p>
        </div>
      </div>

      {/* Input for starting a new conversation */}
      <div className="shrink-0 border-t border-border bg-background p-3">
        <div className="flex items-end gap-2">
          <Textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message to start a new conversation..."
            className="min-h-[44px] max-h-[200px] resize-none"
            rows={1}
            disabled={isSending}
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!text.trim() || isSending}
            className="h-11 w-11 shrink-0"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// Format time ago (e.g., "3mo", "2w", "5d", "3h", "2m")
function formatTimeAgo(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);

  if (months > 0) return `${months}mo`;
  if (weeks > 0) return `${weeks}w`;
  if (days > 0) return `${days}d`;
  if (hours > 0) return `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  return "now";
}
