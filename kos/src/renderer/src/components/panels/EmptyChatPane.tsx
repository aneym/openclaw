/**
 * EmptyChatPane
 *
 * Shown when a chat panel has no chatId assigned.
 * Displays recent sessions to pick from, plus an input to start a new conversation.
 * Supports agent filter pills, search, agent badges, and agent-aware session keys.
 */

import { MessageSquare, Clock, Search, Send } from "lucide-react";
import { useMemo, useCallback, useState, useRef, useEffect } from "react";
import type { Agent } from "../../stores/agent-store";
import type { Chat } from "../../types";
import { parseAgentSessionKey } from "../../lib/session-keys";
import { cn } from "../../lib/utils";
import { useAgentStore } from "../../stores/agent-store";
import { useChatStore } from "../../stores/chat-store";
import { useGatewayStore } from "../../stores/gateway-store";
import { usePanelStore } from "../../stores/panel-store";
import { AgentAvatar } from "../layout/AgentAvatar";
import { AgentFilterPills } from "../layout/AgentFilterPills";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { PanelTypeSwitcher } from "./PanelTypeSwitcher";

interface EmptyChatPaneProps {
  workspaceId: string;
  panelId: string;
  /** IDs of chats already open in other panes (to exclude from picker) */
  openChatIds?: Set<string>;
  /** Agent ID to pre-select in the filter (e.g. from a split pane's source chat) */
  initialAgentId?: string;
}

/** Extract agent ID from a session key (e.g. "agent:main:webchat:..." -> "main") */
function agentIdFromSessionKey(sessionKey: string): string | null {
  return parseAgentSessionKey(sessionKey)?.agentId ?? null;
}

export function EmptyChatPane({
  workspaceId,
  panelId,
  openChatIds,
  initialAgentId,
}: EmptyChatPaneProps) {
  const chatsMap = useChatStore((s) => s.chats);
  const addChat = useChatStore((s) => s.addChat);
  const setActiveChat = useChatStore((s) => s.setActiveChat);
  const openThreadInPane = usePanelStore((s) => s.openThreadInPane);
  const request = useGatewayStore((s) => s.request);

  // Agent state
  const agents = useAgentStore((s) => s.agents);

  // Local filter state (per-pane, not global).
  // Default: initialAgentId (from split context) → first agent (the "main" agent) → null
  const defaultAgentId = initialAgentId ?? (agents.length > 0 ? agents[0].id : null);
  const [localFilter, setLocalFilter] = useState<string | null>(defaultAgentId);

  // Sync default when agents load asynchronously
  const didInitRef = useRef(false);
  useEffect(() => {
    if (!didInitRef.current && agents.length > 0 && localFilter === null) {
      setLocalFilter(initialAgentId ?? agents[0].id);
      didInitRef.current = true;
    }
  }, [agents, initialAgentId, localFilter]);

  const [text, setText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSending, setIsSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isMultiAgent = agents.length >= 2;

  // Build a lookup map for agents
  const agentsById = useMemo(() => {
    const map = new Map<string, Agent>();
    for (const agent of agents) {
      map.set(agent.id, agent);
    }
    return map;
  }, [agents]);

  // Focus the textarea on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Get recent chats, excluding already-open, archived, cron, and applying filters
  const recentChats = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const allChats = Array.from(chatsMap.values() as Iterable<Chat>)
      .filter((c) => {
        if (c.status === "archived") {
          return false;
        }
        if (c.isCron) {
          return false;
        }
        if (openChatIds?.has(c.id)) {
          return false;
        }

        // Agent filter
        if (localFilter) {
          const chatAgentId = agentIdFromSessionKey(c.sessionKey);
          if (chatAgentId !== localFilter) {
            return false;
          }
        }

        // Search filter
        if (query) {
          const matchTitle = c.title?.toLowerCase().includes(query);
          const matchKey = c.sessionKey?.toLowerCase().includes(query);
          const matchSubtitle = c.subtitle?.toLowerCase().includes(query);
          if (!matchTitle && !matchKey && !matchSubtitle) {
            return false;
          }
        }

        return true;
      })
      .toSorted((a, b) => b.lastMessageAt - a.lastMessageAt)
      .slice(0, 15);
    return allChats;
  }, [chatsMap, openChatIds, localFilter, searchQuery]);

  const handleSelectChat = useCallback(
    (chat: Chat) => {
      openThreadInPane(workspaceId, panelId, chat.id);
      if (chat.workspaceId) {
        setActiveChat(chat.workspaceId, chat.id);
      }
    },
    [workspaceId, panelId, openThreadInPane, setActiveChat],
  );

  const createSessionForAgent = useCallback(
    async (messageText: string, agentId?: string) => {
      if (!messageText || isSending) {
        return;
      }

      setIsSending(true);

      // Create session key with agent prefix when multi-agent
      const uuid = crypto.randomUUID();
      const sessionKey =
        agentId && agents.length > 0
          ? `agent:${agentId}:webchat:thread:${uuid}`
          : `kos:thread:${uuid}`;
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

      addChat(newChat);
      openThreadInPane(workspaceId, panelId, newChat.id);
      setActiveChat(workspaceId, newChat.id);
      setText("");

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
    },
    [
      isSending,
      agents.length,
      workspaceId,
      panelId,
      addChat,
      openThreadInPane,
      setActiveChat,
      request,
    ],
  );

  const handleSend = useCallback(async () => {
    const messageText = text.trim();
    if (!messageText) {
      return;
    }

    // Use the agent filter as the target agent, or first agent if available
    const targetAgentId = localFilter ?? (agents.length > 0 ? agents[0].id : undefined);
    await createSessionForAgent(messageText, targetAgentId);
  }, [text, localFilter, agents, createSessionForAgent]);

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
      {/* Type switcher - allows changing panel type before content is assigned */}
      <div className="shrink-0 border-b border-border/50 px-3 py-1.5 bg-muted/30">
        <PanelTypeSwitcher workspaceId={workspaceId} panelId={panelId} currentType="chat" />
      </div>

      {/* Session picker */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-md mx-auto space-y-3">
          {/* Search input */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search sessions..."
              className="h-8 pl-8 text-sm"
            />
          </div>

          {/* Agent filter pills — controlled by local per-pane state */}
          {isMultiAgent && (
            <AgentFilterPills value={localFilter} onChange={setLocalFilter} className="pb-1" />
          )}

          {/* Recent sessions header */}
          <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            {searchQuery ? "Search results" : "Recent sessions"}
          </h3>

          {recentChats.length > 0 ? (
            <div className="space-y-0.5">
              {recentChats.map((chat) => {
                const chatAgentId = agentIdFromSessionKey(chat.sessionKey);
                const chatAgent = chatAgentId ? agentsById.get(chatAgentId) : null;

                return (
                  <button
                    key={chat.id}
                    onClick={() => handleSelectChat(chat)}
                    className={cn(
                      "w-full px-3 py-2 rounded-md text-left transition-colors",
                      "flex items-center gap-3",
                      "text-muted-foreground hover:text-foreground hover:bg-accent/50",
                    )}
                  >
                    {chatAgent ? (
                      <AgentAvatar agent={chatAgent} size="sm" />
                    ) : (
                      <MessageSquare className="h-4 w-4 shrink-0" />
                    )}
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
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground/70 text-center py-4">
              {searchQuery ? "No matching sessions" : "No sessions available"}
            </p>
          )}

          <p className="text-xs text-muted-foreground/50 text-center mt-2">
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

  if (months > 0) {
    return `${months}mo`;
  }
  if (weeks > 0) {
    return `${weeks}w`;
  }
  if (days > 0) {
    return `${days}d`;
  }
  if (hours > 0) {
    return `${hours}h`;
  }
  if (minutes > 0) {
    return `${minutes}m`;
  }
  return "now";
}
