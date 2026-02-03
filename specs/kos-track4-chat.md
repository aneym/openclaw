# kOS Track 4: Chat UI + Agent Integration

## Overview

This track builds the core chat experience for kOS — message rendering, composer, streaming, tool visualization, and agent session panels. It ports the existing Lit/vanilla TS webchat into React 19 + shadcn/ui + Tailwind, using Zustand for per-thread state and the gateway WebSocket hook from Track 1.

**Depends on:** Track 1 (gateway WebSocket client + `useGateway` hook), Track 2 (panel system + thread tabs)

---

## Architecture Summary

```
┌─────────────────────────────────────────────────────┐
│  ChatPanel (per thread tab)                         │
│  ┌───────────────────────────────────────────────┐  │
│  │  ChatMessageList                              │  │
│  │  ┌─ MessageGroup (role=user)                  │  │
│  │  │   └─ UserBubble                            │  │
│  │  ├─ MessageGroup (role=assistant)             │  │
│  │  │   ├─ AssistantBubble (markdown)            │  │
│  │  │   └─ ToolCardGroup (collapsible)           │  │
│  │  ├─ MessageGroup (role=system)                │  │
│  │  │   └─ SystemBanner                          │  │
│  │  └─ StreamingBubble (partial response)        │  │
│  └───────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────┐  │
│  │  QueueBar (visible when items queued)         │  │
│  └───────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────┐  │
│  │  ChatComposer                                 │  │
│  │  ┌─ AttachmentPreview                         │  │
│  │  ├─ Textarea (auto-resize)                    │  │
│  │  └─ ActionButtons (send / abort / queue)      │  │
│  └───────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────┤
│  AgentSessionPanel (side panel, optional)           │
│  ┌─ SessionCard[] (active + history)             │  │
│  └─ TerminalView (full event log)                │  │
└─────────────────────────────────────────────────────┘
```

---

## 1. TypeScript Interfaces

These interfaces are ported from the existing Lit codebase with React adaptations. The existing code uses `unknown` for messages — we introduce strongly-typed alternatives while maintaining backward compatibility with the gateway's raw message format.

### 1.1 Chat Message Types

```typescript
// src/stores/chat-types.ts

/** Content block within a message (Anthropic/OpenAI union format) */
export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "tool_use" | "tool_call"; id?: string; name: string; input?: unknown; arguments?: unknown }
  | { type: "tool_result" | "toolresult"; tool_use_id?: string; name?: string; content?: string | ContentBlock[]; text?: string };

/** A single chat message as stored and rendered */
export interface ChatMessage {
  id?: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string | ContentBlock[];
  timestamp: number;
  /** Present on tool result messages */
  toolCallId?: string;
  tool_call_id?: string;
  toolName?: string;
  tool_name?: string;
  /** Run ID that produced this message */
  runId?: string;
}

/** A tool call extracted from a message for card rendering */
export interface ToolCall {
  kind: "call";
  name: string;
  args?: Record<string, unknown>;
  /** Tool use ID for correlating with results */
  toolUseId?: string;
}

/** A tool result extracted from a message for card rendering */
export interface ToolResult {
  kind: "result";
  name: string;
  text?: string;
  /** Tool use ID this result corresponds to */
  toolUseId?: string;
}

/** Union type for tool cards (same as existing ToolCard) */
export type ToolCard = ToolCall | ToolResult;

/** A group of consecutive same-role messages (Slack-style layout) */
export interface MessageGroup {
  key: string;
  role: "user" | "assistant" | "system" | "tool";
  messages: Array<{ message: ChatMessage; key: string }>;
  timestamp: number;
  isStreaming: boolean;
}

/** Items that appear in the chat thread */
export type ChatItem =
  | { kind: "message"; key: string; message: ChatMessage }
  | { kind: "stream"; key: string; text: string; startedAt: number }
  | { kind: "reading-indicator"; key: string }
  | { kind: "load-more"; key: string; remaining: number; onLoadMore: () => void };

/** File/image attachment on a message being composed */
export interface ChatAttachment {
  id: string;
  dataUrl: string;
  mimeType: string;
}

/** Queued message waiting to be sent */
export interface ChatQueueItem {
  id: string;
  text: string;
  createdAt: number;
  attachments?: ChatAttachment[];
  refreshSessions?: boolean;
}
```

### 1.2 Agent Session Types

```typescript
// src/stores/session-types.ts

/** Coding session status (CC/Codex running via tmux) */
export interface CodingSession {
  id: string;
  taskId: string;
  title: string;
  status: "starting" | "running" | "waiting" | "done" | "error" | "aborted";
  branch: string;
  worktreeRelative: string;
  execSessionId?: string;
  startedAt: string;        // ISO 8601
  finishedAt?: string;       // ISO 8601
  summary?: string | null;
  error?: string | null;
}

/** Agent work phases (detected from stream events) */
export type Phase =
  | "init"
  | "exploring"
  | "planning"
  | "building"
  | "testing"
  | "complete"
  | "error"
  | "idle";

/** A parsed stream event from the coding agent */
export interface StreamEvent {
  type: string;              // "system" | "result" | "tool" | "thinking" | "question"
  subtype?: string;          // "init" | "success" | "error"
  phase: Phase;
  icon: string;              // emoji
  summary: string;           // one-line description
  toolName?: string;
  cost?: number;             // USD
  turns?: number;
  question?: string;         // for AskUserQuestion
  toolUseId?: string;        // for correlating question responses
}

/** Phase display metadata */
export const PHASE_META: Record<Phase, { icon: string; label: string; color: string }> = {
  idle:      { icon: "⏳", label: "Waiting",   color: "hsl(var(--muted-foreground))" },
  init:      { icon: "⚙️", label: "Starting",  color: "hsl(var(--muted-foreground))" },
  exploring: { icon: "🔍", label: "Exploring", color: "hsl(217 91% 60%)" },    // blue-400
  planning:  { icon: "🧠", label: "Planning",  color: "hsl(270 95% 75%)" },    // purple-400
  building:  { icon: "🔨", label: "Building",  color: "hsl(38 92% 50%)" },     // amber-500
  testing:   { icon: "🧪", label: "Testing",   color: "hsl(160 60% 45%)" },    // emerald-500
  complete:  { icon: "✅", label: "Complete",  color: "hsl(142 71% 45%)" },    // green-500
  error:     { icon: "❌", label: "Error",     color: "hsl(0 84% 60%)" },      // red-500
};
```

### 1.3 Gateway Event Types

```typescript
// src/stores/gateway-types.ts

/** Gateway WebSocket event frame */
export interface GatewayEventFrame {
  type: "event";
  event: string;
  payload?: unknown;
  seq?: number;
}

/** Gateway response frame */
export interface GatewayResponseFrame {
  type: "res";
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: { code: string; message: string; details?: unknown };
}

/** Chat event payload from gateway */
export interface ChatEventPayload {
  runId: string;
  sessionKey: string;
  state: "delta" | "final" | "aborted" | "error";
  message?: unknown;
  errorMessage?: string;
}

/** Agent tool event payload from gateway */
export interface AgentEventPayload {
  runId: string;
  seq: number;
  stream: string;          // "tool" | "compaction"
  ts: number;
  sessionKey?: string;
  data: {
    toolCallId?: string;
    name?: string;
    phase?: string;        // "start" | "update" | "result"
    args?: unknown;
    partialResult?: unknown;
    result?: unknown;
    [key: string]: unknown;
  };
}
```

---

## 2. Zustand Chat Store

One store per thread, managed by a store factory. The store holds all state for a single chat thread — messages, stream, queue, tool stream, and agent sessions.

### 2.1 Store Shape

```typescript
// src/stores/use-chat-store.ts
import { create } from "zustand";

interface ChatStore {
  // ── Message State ──
  messages: ChatMessage[];
  loading: boolean;
  error: string | null;

  // ── Streaming State ──
  stream: string | null;             // partial response text (null = not streaming)
  streamStartedAt: number | null;
  runId: string | null;
  sending: boolean;

  // ── Composer State ──
  draft: string;
  attachments: ChatAttachment[];
  queue: ChatQueueItem[];

  // ── Tool Stream State ──
  toolStreamById: Map<string, ToolStreamEntry>;
  toolStreamOrder: string[];
  toolMessages: ChatMessage[];       // derived from tool stream for rendering

  // ── Agent Sessions ──
  codingSessions: CodingSession[];
  sessionEvents: Map<string, StreamEvent[]>;
  sessionPhases: Map<string, Phase>;

  // ── Reasoning ──
  thinkingLevel: string | null;      // "off" | "low" | "medium" | "high"

  // ── Scroll ──
  userNearBottom: boolean;
  showNewMessages: boolean;

  // ── Actions ──
  loadHistory: (client: GatewayClient, sessionKey: string) => Promise<void>;
  sendMessage: (client: GatewayClient, sessionKey: string) => Promise<string | null>;
  abort: (client: GatewayClient, sessionKey: string) => Promise<void>;
  handleChatEvent: (payload: ChatEventPayload) => void;
  handleAgentEvent: (payload: AgentEventPayload) => void;
  setDraft: (text: string) => void;
  addAttachment: (attachment: ChatAttachment) => void;
  removeAttachment: (id: string) => void;
  removeQueueItem: (id: string) => void;
  clearQueue: () => void;
  sendQueuedNow: (client: GatewayClient, sessionKey: string, id: string) => Promise<void>;
  setUserNearBottom: (value: boolean) => void;
  resetToolStream: () => void;
}
```

### 2.2 Store Factory

```typescript
// Thread stores are created/cached per sessionKey
const threadStores = new Map<string, ReturnType<typeof createChatStore>>();

export function useChatStore(sessionKey: string): ChatStore {
  let store = threadStores.get(sessionKey);
  if (!store) {
    store = createChatStore(sessionKey);
    threadStores.set(sessionKey, store);
  }
  return store();
}

// Cleanup when thread is closed
export function disposeChatStore(sessionKey: string): void {
  threadStores.delete(sessionKey);
}
```

### 2.3 Key Store Actions

#### `loadHistory`

```typescript
loadHistory: async (client, sessionKey) => {
  set({ loading: true, error: null });
  try {
    const res = await client.request("chat.history", {
      sessionKey,
      limit: 200,
    });
    set({
      messages: Array.isArray(res.messages) ? res.messages : [],
      thinkingLevel: res.thinkingLevel ?? null,
      loading: false,
    });
  } catch (err) {
    set({ error: String(err), loading: false });
  }
}
```

#### `handleChatEvent`

Maps directly from the existing `handleChatEvent` in `controllers/chat.ts`:

```typescript
handleChatEvent: (payload) => {
  const state = get();
  // Ignore events for other sessions (handled by event router)

  if (payload.state === "delta") {
    // Adopt runId from first delta (reconnect case)
    const updates: Partial<ChatStore> = {};
    if (!state.runId && payload.runId) {
      updates.runId = payload.runId;
      updates.streamStartedAt = state.streamStartedAt ?? Date.now();
    }
    const next = extractText(payload.message);
    if (typeof next === "string") {
      const current = state.stream ?? "";
      if (!current || next.length >= current.length) {
        updates.stream = next;
      }
    }
    set(updates);
  } else if (payload.state === "final") {
    set({ stream: null, runId: null, streamStartedAt: null });
    // Reload history to get final message
    // (triggered by caller via loadHistory)
  } else if (payload.state === "aborted" || payload.state === "error") {
    set({
      stream: null,
      runId: null,
      streamStartedAt: null,
      error: payload.state === "error" ? (payload.errorMessage ?? "chat error") : null,
    });
  }
}
```

#### `handleAgentEvent` (tool stream)

Maps from `handleAgentEvent` in `app-tool-stream.ts`:

```typescript
handleAgentEvent: (payload) => {
  if (payload.stream !== "tool") return;
  const state = get();
  if (!state.runId) return;
  if (payload.runId !== state.runId) return;

  const data = payload.data;
  const toolCallId = data.toolCallId;
  if (!toolCallId) return;

  const name = data.name ?? "tool";
  const phase = data.phase ?? "";
  const args = phase === "start" ? data.args : undefined;
  const output = phase === "update"
    ? formatToolOutput(data.partialResult)
    : phase === "result"
      ? formatToolOutput(data.result)
      : undefined;

  // Upsert tool stream entry
  const byId = new Map(state.toolStreamById);
  const order = [...state.toolStreamOrder];
  let entry = byId.get(toolCallId);
  const now = Date.now();

  if (!entry) {
    entry = {
      toolCallId, runId: payload.runId, name,
      args, output, startedAt: payload.ts ?? now, updatedAt: now,
    };
    byId.set(toolCallId, entry);
    order.push(toolCallId);
  } else {
    entry = { ...entry, name, updatedAt: now };
    if (args !== undefined) entry.args = args;
    if (output !== undefined) entry.output = output;
    byId.set(toolCallId, entry);
  }

  // Trim to 50 entries
  while (order.length > 50) {
    const removed = order.shift()!;
    byId.delete(removed);
  }

  // Build tool messages for rendering
  const toolMessages = order
    .map(id => byId.get(id))
    .filter(Boolean)
    .map(e => buildToolStreamMessage(e!));

  set({ toolStreamById: byId, toolStreamOrder: order, toolMessages });
}
```

---

## 3. Gateway WebSocket Protocol for Chat

### 3.1 Sending Messages

```typescript
// Request
{
  type: "req",
  id: "<uuid>",
  method: "chat.send",
  params: {
    sessionKey: "agent:main:main:thread:<uuid>",
    message: "Hello, write a function that...",
    deliver: false,           // don't echo back to other channels
    idempotencyKey: "<uuid>", // prevents duplicate sends on reconnect
    attachments: [            // optional
      {
        type: "image",
        mimeType: "image/jpeg",
        content: "<base64>"   // raw base64, NOT data URL
      }
    ]
  }
}

// Response
{
  type: "res",
  id: "<uuid>",
  ok: true,
  payload: { runId: "<uuid>" }
}
```

### 3.2 Loading History

```typescript
// Request
{
  type: "req",
  id: "<uuid>",
  method: "chat.history",
  params: {
    sessionKey: "agent:main:main:thread:<uuid>",
    limit: 200          // max messages to return
  }
}

// Response
{
  type: "res",
  id: "<uuid>",
  ok: true,
  payload: {
    messages: ChatMessage[],    // array of messages, newest last
    thinkingLevel: "off" | "low" | "medium" | "high" | null
  }
}
```

### 3.3 Aborting a Run

```typescript
// Request
{
  type: "req",
  id: "<uuid>",
  method: "chat.abort",
  params: {
    sessionKey: "agent:main:main:thread:<uuid>",
    runId: "<uuid>"     // optional; omit to abort any active run
  }
}

// Response
{ type: "res", id: "<uuid>", ok: true }
```

### 3.4 Streaming Events (Server → Client)

The gateway sends events via the WebSocket event frame:

#### Chat Delta (partial response)

```typescript
{
  type: "event",
  event: "chat",
  seq: 42,
  payload: {
    runId: "<uuid>",
    sessionKey: "agent:main:main:thread:<uuid>",
    state: "delta",
    message: {
      role: "assistant",
      content: [{ type: "text", text: "Here's how you can..." }]
    }
  }
}
```

**Key behavior:** Each delta contains the **full text so far**, not just the new characters. The client replaces `stream` with the new text if `next.length >= current.length`. This handles out-of-order delivery gracefully.

#### Chat Final (complete response)

```typescript
{
  type: "event",
  event: "chat",
  payload: {
    runId: "<uuid>",
    sessionKey: "agent:main:main:thread:<uuid>",
    state: "final",
    message: {
      role: "assistant",
      content: [
        { type: "thinking", thinking: "Let me think about..." },
        { type: "text", text: "Here's the complete answer..." },
        { type: "tool_use", id: "tu_123", name: "Write", input: { file_path: "src/foo.ts", content: "..." } }
      ],
      timestamp: 1706900000000
    }
  }
}
```

On `final`: clear streaming state, reload history from gateway to get the canonical message with all tool results.

#### Chat Aborted / Error

```typescript
// Aborted
{ type: "event", event: "chat", payload: { runId: "...", sessionKey: "...", state: "aborted" } }

// Error
{ type: "event", event: "chat", payload: { runId: "...", sessionKey: "...", state: "error", errorMessage: "context length exceeded" } }
```

#### Tool Stream Events

```typescript
// Tool start
{
  type: "event",
  event: "agent",
  payload: {
    runId: "<uuid>",
    seq: 1,
    stream: "tool",
    ts: 1706900001000,
    sessionKey: "agent:main:main:thread:<uuid>",
    data: {
      toolCallId: "tc_abc",
      name: "Read",
      phase: "start",
      args: { file_path: "src/index.ts" }
    }
  }
}

// Tool result
{
  type: "event",
  event: "agent",
  payload: {
    runId: "<uuid>",
    seq: 2,
    stream: "tool",
    ts: 1706900002000,
    sessionKey: "agent:main:main:thread:<uuid>",
    data: {
      toolCallId: "tc_abc",
      name: "Read",
      phase: "result",
      result: { content: [{ type: "text", text: "file contents..." }] }
    }
  }
}
```

#### Compaction Events

```typescript
{ type: "event", event: "agent", payload: { stream: "compaction", data: { phase: "start" } } }
{ type: "event", event: "agent", payload: { stream: "compaction", data: { phase: "end" } } }
```

---

## 4. Components

### 4.1 ChatPanel

Top-level container for a single thread's chat. Mounted once per thread tab.

```typescript
// src/components/chat/ChatPanel.tsx

interface ChatPanelProps {
  sessionKey: string;
  /** Gateway client from Track 1's useGateway hook */
  gateway: GatewayClient;
  connected: boolean;
}

export function ChatPanel({ sessionKey, gateway, connected }: ChatPanelProps) {
  const store = useChatStore(sessionKey);

  // Load history on mount and session change
  useEffect(() => {
    if (connected) {
      store.loadHistory(gateway, sessionKey);
    }
  }, [sessionKey, connected]);

  // Subscribe to gateway events
  useGatewayEvent("chat", (payload: ChatEventPayload) => {
    if (payload.sessionKey !== sessionKey) return;
    const result = store.handleChatEvent(payload);
    if (result === "final") {
      store.loadHistory(gateway, sessionKey);
      // Flush queue after run completes
      store.flushQueue(gateway, sessionKey);
    }
  });

  useGatewayEvent("agent", (payload: AgentEventPayload) => {
    store.handleAgentEvent(payload);
  });

  return (
    <div className="flex flex-col h-full">
      <ChatMessageList
        messages={store.messages}
        toolMessages={store.toolMessages}
        stream={store.stream}
        streamStartedAt={store.streamStartedAt}
        loading={store.loading}
        thinkingLevel={store.thinkingLevel}
        userNearBottom={store.userNearBottom}
        onScrollChange={store.setUserNearBottom}
        showNewMessages={store.showNewMessages}
      />
      {store.queue.length > 0 && (
        <QueueBar
          queue={store.queue}
          onRemove={store.removeQueueItem}
          onSendNow={(id) => store.sendQueuedNow(gateway, sessionKey, id)}
          onClearAll={store.clearQueue}
        />
      )}
      <ChatComposer
        draft={store.draft}
        attachments={store.attachments}
        sending={store.sending}
        streaming={store.stream !== null}
        connected={connected}
        runId={store.runId}
        onDraftChange={store.setDraft}
        onAddAttachment={store.addAttachment}
        onRemoveAttachment={store.removeAttachment}
        onSend={() => store.sendMessage(gateway, sessionKey)}
        onAbort={() => store.abort(gateway, sessionKey)}
      />
    </div>
  );
}
```

### 4.2 ChatMessageList

Renders the scrollable message thread with grouping, auto-scroll, and load-more.

```typescript
// src/components/chat/ChatMessageList.tsx

interface ChatMessageListProps {
  messages: ChatMessage[];
  toolMessages: ChatMessage[];
  stream: string | null;
  streamStartedAt: number | null;
  loading: boolean;
  thinkingLevel: string | null;
  userNearBottom: boolean;
  onScrollChange: (nearBottom: boolean) => void;
  showNewMessages: boolean;
}
```

**Implementation details:**

#### Message Grouping

Port the `groupMessages` logic from `grouped-render.ts`. Consecutive messages with the same normalized role are grouped into a `MessageGroup`:

```typescript
function groupMessages(items: ChatItem[]): (ChatItem | MessageGroup)[] {
  // 1. Normalize each message's role via normalizeRoleForGrouping()
  // 2. Group consecutive same-role messages
  // 3. Special: fold chip-only tool results into preceding assistant group
  //    (isChipOnlyMessage check — tool results with extractable ToolCards
  //     but no meaningful text content)
}
```

Role normalization rules (from `message-normalizer.ts`):
- `"user"` / `"User"` → `"user"`
- `"assistant"` → `"assistant"`
- `"system"` → `"system"`
- `"toolresult"` / `"tool_result"` / `"tool"` / `"function"` → `"tool"`
- Messages with `toolCallId` or `tool_call_id` field → treated as tool result regardless of role

#### Virtual Rendering Limit

The existing code renders only the last 50 messages initially (`CHAT_HISTORY_RENDER_LIMIT = 50`). Port this:

```typescript
const RENDER_LIMIT = 50;
const LOAD_MORE_BATCH = 50;

const [renderOffset, setRenderOffset] = useState(0);

// On mount or history change, reset to show last RENDER_LIMIT
const visibleStart = Math.max(0, messages.length - RENDER_LIMIT - renderOffset);
const visibleMessages = messages.slice(visibleStart);

// "Load more" button at top when there are older messages
{visibleStart > 0 && (
  <LoadMoreButton
    remaining={visibleStart}
    onLoadMore={() => setRenderOffset(prev => prev + LOAD_MORE_BATCH)}
  />
)}
```

#### Load More (scroll-up pagination)

When the user clicks "Load more", prepend older messages and **preserve scroll position**:

```typescript
function handleLoadMore() {
  const thread = threadRef.current;
  if (!thread) return;
  const prevHeight = thread.scrollHeight;

  setRenderOffset(prev => prev + LOAD_MORE_BATCH);

  // After React re-renders, restore scroll position
  requestAnimationFrame(() => {
    const newHeight = thread.scrollHeight;
    thread.scrollTop += newHeight - prevHeight;
  });
}
```

### 4.3 Auto-Scroll Behavior

Port from `app-scroll.ts`. The behavior:

1. **Near-bottom threshold:** 450px from the bottom of the scroll container
2. **On new content (delta/message):**
   - If user is near bottom → auto-scroll to bottom
   - If user has scrolled up → do NOT auto-scroll; show "New messages" indicator
3. **On user scroll:**
   - Track `userNearBottom` via scroll event
   - Clear "new messages" indicator when user scrolls back to bottom
4. **Scroll behavior:**
   - Small jumps (<800px): `behavior: "smooth"`
   - Large jumps (initial load, history swap): `behavior: "instant"`
5. **Force scroll:** On send message, always scroll to bottom (user just sent, they want to see it)

```typescript
// src/hooks/use-auto-scroll.ts

const NEAR_BOTTOM_THRESHOLD = 450;

export function useAutoScroll(
  containerRef: RefObject<HTMLDivElement>,
  deps: unknown[],         // re-check on stream/messages changes
  options: {
    enabled: boolean;       // false when user scrolled up
    force?: boolean;        // true after sending
  }
) {
  const userNearBottom = useRef(true);
  const hasAutoScrolled = useRef(false);
  const [showNewMessages, setShowNewMessages] = useState(false);

  // Scroll handler: track user position
  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    userNearBottom.current = dist < NEAR_BOTTOM_THRESHOLD;
    if (userNearBottom.current) {
      setShowNewMessages(false);
    }
  }, []);

  // Auto-scroll effect
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;

    if (options.force && !hasAutoScrolled.current) {
      el.scrollTo({ top: el.scrollHeight, behavior: "instant" });
      hasAutoScrolled.current = true;
      return;
    }

    if (userNearBottom.current || dist < NEAR_BOTTOM_THRESHOLD) {
      const behavior = dist > 800 ? "instant" : "smooth";
      el.scrollTo({ top: el.scrollHeight, behavior });
    } else {
      setShowNewMessages(true);
    }
  }, deps);

  // "Scroll to bottom" button handler
  const scrollToBottom = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    setShowNewMessages(false);
  }, []);

  return { handleScroll, showNewMessages, scrollToBottom };
}
```

### 4.4 Message Rendering

#### AssistantBubble (Markdown)

```typescript
// src/components/chat/AssistantBubble.tsx

interface AssistantBubbleProps {
  message: ChatMessage;
  isStreaming: boolean;
  showReasoning: boolean;
}
```

**Markdown rendering approach:**

Use `react-markdown` with plugins for the React port (the existing code uses `marked` + `DOMPurify` for Lit's `unsafeHTML`). The React approach is safer and more idiomatic:

```typescript
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

function MarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code({ node, inline, className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || "");
          const lang = match?.[1];

          if (!inline && lang) {
            return (
              <CodeBlock language={lang}>
                {String(children).replace(/\n$/, "")}
              </CodeBlock>
            );
          }
          return <code className={className} {...props}>{children}</code>;
        },
        a({ href, children }) {
          return (
            <a href={href} target="_blank" rel="noreferrer noopener">
              {children}
            </a>
          );
        },
        table({ children }) {
          return (
            <div className="overflow-x-auto">
              <table className="border-collapse text-sm">{children}</table>
            </div>
          );
        },
      }}
    />
  );
}
```

**Code blocks with copy button:**

```typescript
function CodeBlock({ language, children }: { language: string; children: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="relative group rounded-lg overflow-hidden border border-border">
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted text-xs text-muted-foreground">
        <span>{language}</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            navigator.clipboard.writeText(children);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        </Button>
      </div>
      <SyntaxHighlighter
        language={language}
        style={oneDark}
        customStyle={{ margin: 0, borderRadius: 0 }}
      >
        {children}
      </SyntaxHighlighter>
    </div>
  );
}
```

**Performance constraints** (from existing `markdown.ts`):
- Cache rendered HTML per message content string (WeakMap or LRU)
- Truncate at 140,000 chars (`MARKDOWN_CHAR_LIMIT`)
- For text > 40,000 chars (`MARKDOWN_PARSE_LIMIT`), render as plain `<pre>` (skip markdown parsing)
- LRU cache of 200 entries, max 50,000 chars per entry

```typescript
// src/lib/markdown-cache.ts
const CACHE_LIMIT = 200;
const CACHE_MAX_CHARS = 50_000;
const CHAR_LIMIT = 140_000;
const PARSE_LIMIT = 40_000;

const cache = new Map<string, ReactNode>();

export function getCachedMarkdown(text: string): ReactNode | null {
  if (text.length > CACHE_MAX_CHARS) return null;
  const cached = cache.get(text);
  if (!cached) return null;
  // Move to end (LRU)
  cache.delete(text);
  cache.set(text, cached);
  return cached;
}

export function setCachedMarkdown(text: string, node: ReactNode): void {
  if (text.length > CACHE_MAX_CHARS) return;
  cache.set(text, node);
  if (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
}
```

#### Thinking/Reasoning Indicator

When `thinkingLevel !== "off"` and the message contains `{ type: "thinking" }` blocks:

```typescript
function ThinkingBlock({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const preview = text.slice(0, 200);

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
        <Brain className="h-3 w-3" />
        <span>Reasoning</span>
        <ChevronRight className={cn("h-3 w-3 transition-transform", expanded && "rotate-90")} />
      </CollapsibleTrigger>
      <CollapsibleContent className="text-sm italic text-muted-foreground mt-1 pl-4 border-l-2 border-muted">
        <MarkdownContent content={text} />
      </CollapsibleContent>
    </Collapsible>
  );
}
```

#### UserBubble

```typescript
function UserBubble({ message }: { message: ChatMessage }) {
  const text = extractText(message);
  const images = extractImages(message);

  return (
    <div className="flex flex-col gap-2">
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((img, i) => (
            <img
              key={i}
              src={img.url}
              alt="Attached"
              className="max-w-[200px] max-h-[200px] rounded-lg cursor-pointer"
              onClick={() => window.open(img.url, "_blank")}
            />
          ))}
        </div>
      )}
      {text && <div className="whitespace-pre-wrap">{text}</div>}
    </div>
  );
}
```

#### SystemBanner

System messages are rendered differently — smaller, muted, centered:

```typescript
function SystemBanner({ message }: { message: ChatMessage }) {
  const text = extractText(message);
  if (!text) return null;

  // Filter internal system messages (GatewayRestart, etc.)
  if (/^(System:\s*\[.*?\]\s*)?GatewayRestart[\s:]/.test(text.trimStart())) {
    return null;
  }

  return (
    <div className="flex justify-center py-2">
      <div className="text-xs text-muted-foreground bg-muted/50 px-3 py-1 rounded-full max-w-[80%] text-center">
        {text}
      </div>
    </div>
  );
}
```

### 4.5 StreamingBubble

Shows the partial response during streaming with a typing indicator:

```typescript
function StreamingBubble({ text, startedAt }: { text: string; startedAt: number }) {
  if (!text.trim()) {
    return <ReadingIndicator />;
  }

  return (
    <div className="chat-bubble streaming">
      <MarkdownContent content={text} />
      <span className="inline-block w-2 h-4 bg-foreground/60 animate-pulse ml-0.5" />
    </div>
  );
}

function ReadingIndicator() {
  return (
    <div className="flex gap-1 px-3 py-2">
      <span className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:0ms]" />
      <span className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:150ms]" />
      <span className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:300ms]" />
    </div>
  );
}
```

### 4.6 ChatComposer

```typescript
// src/components/chat/ChatComposer.tsx

interface ChatComposerProps {
  draft: string;
  attachments: ChatAttachment[];
  sending: boolean;
  streaming: boolean;
  connected: boolean;
  runId: string | null;
  onDraftChange: (text: string) => void;
  onAddAttachment: (att: ChatAttachment) => void;
  onRemoveAttachment: (id: string) => void;
  onSend: () => void;
  onAbort: () => void;
}
```

**Key behaviors:**

1. **Auto-resize textarea:**
   ```typescript
   const textareaRef = useRef<HTMLTextAreaElement>(null);

   useEffect(() => {
     const el = textareaRef.current;
     if (!el) return;
     el.style.height = "auto";
     el.style.height = `${el.scrollHeight}px`;
   }, [draft]);
   ```

2. **Keyboard handling:**
   - `Enter` → send (if connected and not empty)
   - `Shift+Enter` → newline (default textarea behavior)
   - `Cmd+Shift+Enter` (Mac) / `Ctrl+Shift+Enter` → send immediately (abort current run first)
   - `Escape` → close autocomplete overlay

3. **File/image attachments:**
   - **Paste:** intercept `ClipboardEvent`, check for `image/*` items
   - **Drag-and-drop:** `onDragOver` + `onDrop` on the composer area
   - **Button:** hidden `<input type="file" accept="image/*">` triggered by button click
   - Compress images before attaching (existing `compressImage` logic):
     - Max dimension: 1568px
     - JPEG quality: 0.8, decreasing to 0.2 if still over 4MB
     - PNG preserved only if image has actual transparency

4. **Send/queue/abort button states:**
   ```
   idle + connected       → Send button (primary)
   streaming + connected  → [Abort button] + [Queue button]
   sending                → Disabled send button with spinner
   disconnected           → Disabled with "connecting…" placeholder
   ```

5. **Attachment preview bar** — shown above the textarea when attachments exist:
   ```typescript
   function AttachmentPreview({ attachments, onRemove }: { ... }) {
     return (
       <div className="flex gap-2 p-2 border-b border-border">
         {attachments.map(att => (
           <div key={att.id} className="relative group">
             <img src={att.dataUrl} className="h-16 w-16 object-cover rounded" />
             <button
               onClick={() => onRemove(att.id)}
               className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
             >
               <X className="h-3 w-3" />
             </button>
           </div>
         ))}
       </div>
     );
   }
   ```

### 4.7 Tool Stream Visualization

Tool calls appear as collapsible cards inline in the chat flow. Port from `tool-cards.ts`.

#### ToolCardGroup

When consecutive tool-result messages are grouped (chip-only messages), they collapse into a summary:

```typescript
function ToolCardGroup({ cards }: { cards: ToolCard[] }) {
  return (
    <Collapsible>
      <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Wrench className="h-3 w-3" />
        <span>{cards.length} tool call{cards.length !== 1 ? "s" : ""}</span>
        <ChevronDown className="h-3 w-3" />
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-wrap gap-1 mt-1">
        {cards.map((card, i) => (
          <ToolChip key={i} card={card} />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}
```

#### ToolChip

Individual tool call/result as a compact clickable chip:

```typescript
function ToolChip({ card, onOpenDetail }: { card: ToolCard; onOpenDetail?: (card: ToolCard) => void }) {
  const display = resolveToolDisplay(card);

  return (
    <button
      onClick={() => onOpenDetail?.(card)}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-muted hover:bg-muted/80 transition-colors"
    >
      <ToolIcon name={card.name} className="h-3 w-3" />
      <span className="font-medium">{display.label}</span>
      {display.detail && (
        <span className="text-muted-foreground truncate max-w-[150px]">{display.detail}</span>
      )}
    </button>
  );
}
```

**Tool display resolution** (from existing `tool-display.ts` patterns):

| Tool Name | Icon | Label | Detail |
|-----------|------|-------|--------|
| Read | 📖 | Read | `shortPath(file_path)` |
| Write | 📝 | Write | `shortPath(file_path)` |
| Edit | ✏️ | Edit | `shortPath(file_path)` |
| Bash / exec | ⚡ | Exec | `command.slice(0, 80)` |
| Glob | 🔍 | Search | `pattern` |
| Grep | 🔍 | Grep | `pattern` |
| WebSearch / web_search | 🌐 | Search | `query` |
| WebFetch / web_fetch | 🌐 | Fetch | `url` (hostname only) |
| browser | 🌐 | Browser | `action` |
| Task | 🔀 | Sub-agent | `prompt.slice(0, 60)` |

### 4.8 QueueBar

Shows queued messages when agent is busy:

```typescript
// src/components/chat/QueueBar.tsx

interface QueueBarProps {
  queue: ChatQueueItem[];
  onRemove: (id: string) => void;
  onSendNow: (id: string) => void;
  onClearAll: () => void;
}

function QueueBar({ queue, onRemove, onSendNow, onClearAll }: QueueBarProps) {
  return (
    <div className="border-t border-border bg-muted/30 px-3 py-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
          <ListPlus className="h-3 w-3" />
          Queued · {queue.length}
        </span>
        <Button variant="ghost" size="sm" onClick={onClearAll} className="text-xs h-6">
          Clear
        </Button>
      </div>
      <div className="space-y-1">
        {queue.map(item => (
          <div key={item.id} className="flex items-center gap-2 text-sm">
            <span className="flex-1 truncate">{item.text || `Image (${item.attachments?.length})`}</span>
            <span className="text-xs text-muted-foreground">{relativeTime(item.createdAt)}</span>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onSendNow(item.id)}>
              <ArrowUp className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onRemove(item.id)}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## 5. Agent Session Panel

The session panel appears as a side panel or bottom panel when coding agents (CC/Codex) are active.

### 5.1 AgentSessionPanel

```typescript
// src/components/agent/AgentSessionPanel.tsx

interface AgentSessionPanelProps {
  sessions: CodingSession[];
  sessionEvents: Map<string, StreamEvent[]>;
  sessionPhases: Map<string, Phase>;
  onKill: (id: string) => void;
  onOpenTerminal: (id: string) => void;
  onRespond: (id: string, text: string, toolUseId?: string) => void;
  onDismiss: (id: string) => void;
  onClose: () => void;
  onRefresh: () => void;
}
```

**Layout:**
- Header: "🧩 Code Sessions" + active count badge + refresh + close buttons
- Body: Active sessions (expandable cards), then History section
- Each card shows: phase indicator, title, elapsed time, step count, last action
- Expanded: event timeline, toolbar (terminal/kill/remove), pending questions

### 5.2 SessionCard

Each coding session renders as a collapsible card:

```typescript
function SessionCard({ session, events, phase, ... }: SessionCardProps) {
  const [expanded, setExpanded] = useState(session.status === "running");
  const meta = PHASE_META[phase];
  const isActive = ["running", "starting", "waiting"].includes(session.status);
  const turnCount = events.filter(e => e.type === "tool" || e.type === "thinking").length;

  return (
    <Card className={cn("transition-all", isActive && "ring-1 ring-primary/20")}>
      <CardHeader onClick={() => setExpanded(!expanded)} className="cursor-pointer py-2 px-3">
        <div className="flex items-center gap-2">
          {/* Phase indicator */}
          <span style={{ color: meta.color }} className="text-lg">
            {meta.icon}
            {isActive && <span className="animate-ping absolute ..." />}
          </span>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm truncate">
              {session.taskId}: {session.title}
            </div>
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <span style={{ color: meta.color }} className="font-semibold">{meta.label}</span>
              <span>·</span>
              <span>{elapsed(session.startedAt, session.finishedAt)}</span>
              {turnCount > 0 && <><span>·</span><span>{turnCount} steps</span></>}
            </div>
          </div>

          {/* Chevron */}
          <ChevronDown className={cn("h-4 w-4 transition-transform", expanded && "rotate-180")} />
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0 px-3 pb-3">
          {/* Toolbar */}
          <div className="flex items-center gap-2 mb-2">
            <Button size="sm" variant="outline" onClick={() => onOpenTerminal(session.id)}>
              🖥️ Terminal
            </Button>
            {isActive ? (
              <Button size="sm" variant="destructive" onClick={() => onKill(session.id)}>
                ⏹ Kill
              </Button>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => onDismiss(session.id)}>
                🗑 Remove
              </Button>
            )}
            <span className="text-xs text-muted-foreground ml-auto flex items-center gap-1">
              <GitBranch className="h-3 w-3" /> {session.branch}
            </span>
          </div>

          {/* Event timeline */}
          <EventTimeline events={events} />

          {/* Pending question */}
          {pendingQuestion && <QuestionInput ... />}

          {/* Error/Summary */}
          {session.error && <Alert variant="destructive">{session.error}</Alert>}
          {session.summary && <div className="text-sm text-muted-foreground">{session.summary}</div>}
        </CardContent>
      )}
    </Card>
  );
}
```

### 5.3 Event Timeline

Scrollable list of agent stream events:

```typescript
function EventTimeline({ events }: { events: StreamEvent[] }) {
  const visible = events.slice(-30); // Show last 30

  return (
    <div className="max-h-[300px] overflow-y-auto space-y-0.5 text-xs font-mono">
      {visible.length === 0 ? (
        <div className="text-muted-foreground text-center py-4">Waiting for output…</div>
      ) : (
        visible.map((ev, i) => (
          <div key={i} className="flex items-start gap-1.5 py-0.5">
            <span className="flex-shrink-0">{ev.icon}</span>
            <span className="text-muted-foreground break-all">{ev.summary}</span>
          </div>
        ))
      )}
    </div>
  );
}
```

### 5.4 Phase Detection

Port from `coding-panel.ts`. Phase is detected from the most recent stream event:

```typescript
const EXPLORE_TOOLS = new Set(["Read", "Glob", "Grep", "Bash", "ListMcpResourcesTool", "ReadMcpResourceTool", "WebFetch", "WebSearch", "Skill", "ToolSearch"]);
const BUILD_TOOLS = new Set(["Edit", "Write", "NotebookEdit"]);
const TEST_PATTERNS = /\b(test|jest|vitest|mocha|pytest|cargo test|go test|npm test|pnpm test)\b/i;

function detectPhase(event: StreamJsonEvent): Phase {
  if (event.type === "system") return "init";
  if (event.type === "result") return event.subtype === "success" ? "complete" : "error";

  if (event.type === "assistant" && event.message?.content) {
    for (const block of event.message.content) {
      if (block.type === "tool_use") {
        if (block.name === "Task") return "planning";
        if (BUILD_TOOLS.has(block.name)) return "building";
        if ((block.name === "Bash" || block.name === "bash") && TEST_PATTERNS.test(block.input?.command ?? "")) return "testing";
        if (EXPLORE_TOOLS.has(block.name)) return "exploring";
        return "exploring";
      }
      if (block.type === "text" && block.text?.trim()) return "planning";
    }
  }
  return "idle";
}
```

### 5.5 Status Indicators

| Status | Indicator | Description |
|--------|-----------|-------------|
| `"running"` | 🟢 + pulse animation | Agent actively processing |
| `"waiting"` | 🟡 | Agent waiting for user input (AskUserQuestion) |
| `"starting"` | 🟢 + pulse | Agent session initializing |
| `"done"` | ✅ | Session completed successfully |
| `"error"` | 🔴 | Session failed |
| `"aborted"` | ⏹ | Session was killed |

Staleness detection: if a `"running"` session hasn't received an event in >60 seconds, show a warning indicator.

---

## 6. Message History Loading

### 6.1 Initial Load

On thread tab open:

```typescript
useEffect(() => {
  if (!connected) return;

  // Load history from gateway
  store.loadHistory(gateway, sessionKey);

  // Also query if there's an active run (for reconnect)
  gateway.request("chat.status", { sessionKey })
    .then((res) => {
      if (res?.runId) {
        // There's an active run — adopt it for the stop button
        store.adoptRun(res.runId);
      }
    })
    .catch(() => {}); // non-critical
}, [sessionKey, connected]);
```

### 6.2 History Reload on Final

When a `final` event arrives, the client reloads history to get the canonical message:

```typescript
// In event handler
if (payload.state === "final") {
  store.clearStream();
  store.loadHistory(gateway, sessionKey); // reload to get final message
  store.resetToolStream();                // clear in-flight tool cards
  store.flushQueue(gateway, sessionKey);  // send next queued message
}
```

### 6.3 Tool Message Visibility Toggle

Tool messages (tool stream) are shown during active runs and when the user has expanded thinking:

```typescript
const showToolMessages = stream !== null || thinkingLevel !== "off";

// In message list
const allMessages = showToolMessages
  ? [...messages, ...toolMessages]
  : messages;
```

---

## 7. Reconnection Behavior

### 7.1 On WebSocket Reconnect

When the gateway WebSocket reconnects (from Track 1's `useGateway` hook):

1. **Reload history** for all open threads
2. **Query active run** — `chat.status` to check if agent is still running
3. **Adopt run ID** from first incoming delta (if `runId` is null but deltas arrive)
4. **Resume tool stream** — tool events continue arriving; the store merges them

```typescript
useGatewayReconnect(() => {
  // Reload all open thread stores
  for (const sessionKey of openThreads) {
    const store = useChatStore(sessionKey);
    store.loadHistory(gateway, sessionKey);
  }
});
```

### 7.2 Handling Gaps

The gateway sends sequence numbers (`seq`) on event frames. If a gap is detected (expected seq N, got N+k), the client should reload history to ensure no messages were missed:

```typescript
useGatewayGap((info) => {
  console.warn(`Event gap: expected ${info.expected}, got ${info.received}`);
  store.loadHistory(gateway, sessionKey);
});
```

---

## 8. File Structure

```
src/
├── components/
│   ├── chat/
│   │   ├── ChatPanel.tsx              # Top-level chat container
│   │   ├── ChatMessageList.tsx        # Scrollable message thread
│   │   ├── ChatComposer.tsx           # Input area + attachments
│   │   ├── MessageGroup.tsx           # Grouped messages wrapper
│   │   ├── AssistantBubble.tsx        # Markdown-rendered assistant message
│   │   ├── UserBubble.tsx             # User message (text + images)
│   │   ├── SystemBanner.tsx           # System message (centered, muted)
│   │   ├── StreamingBubble.tsx        # Partial response + cursor
│   │   ├── ReadingIndicator.tsx       # Bouncing dots
│   │   ├── ThinkingBlock.tsx          # Collapsible reasoning
│   │   ├── ToolCardGroup.tsx          # Collapsed group of tool chips
│   │   ├── ToolChip.tsx              # Individual tool call/result chip
│   │   ├── QueueBar.tsx              # Queued messages bar
│   │   ├── CodeBlock.tsx             # Syntax-highlighted code with copy
│   │   ├── MarkdownContent.tsx       # react-markdown wrapper
│   │   └── AttachmentPreview.tsx     # Image attachment thumbnails
│   └── agent/
│       ├── AgentSessionPanel.tsx     # Session list panel
│       ├── SessionCard.tsx           # Expandable session card
│       ├── EventTimeline.tsx         # Scrollable event list
│       ├── TerminalView.tsx          # Full-screen event log
│       └── QuestionInput.tsx         # Inline question response
├── stores/
│   ├── chat-types.ts                 # TypeScript interfaces
│   ├── session-types.ts              # CodingSession, Phase, StreamEvent
│   ├── gateway-types.ts              # Gateway protocol types
│   └── use-chat-store.ts            # Zustand store factory
├── hooks/
│   ├── use-auto-scroll.ts           # Auto-scroll logic
│   └── use-gateway-event.ts         # Gateway event subscription (from Track 1)
└── lib/
    ├── markdown-cache.ts             # LRU markdown render cache
    ├── message-normalizer.ts         # Role normalization, tool detection
    ├── message-extract.ts            # Text/thinking extraction with caching
    ├── tool-display.ts               # Tool name → icon/label/detail mapping
    ├── image-compress.ts             # Image compression for attachments
    └── format.ts                     # Time formatting, text truncation
```

---

## 9. Milestones

### M1: Core Message Rendering
- [ ] `ChatMessage` / `ToolCard` / `MessageGroup` types
- [ ] `ChatMessageList` with message grouping
- [ ] `AssistantBubble` with markdown + code blocks
- [ ] `UserBubble` with image display
- [ ] `SystemBanner`
- [ ] Role normalization and grouping logic
- [ ] Virtual render limit (50 messages) + "Load more"
- [ ] Basic auto-scroll (near-bottom detection)

### M2: Streaming + Gateway Integration
- [ ] Zustand chat store with `handleChatEvent`
- [ ] `StreamingBubble` with cursor animation
- [ ] `ReadingIndicator` (bouncing dots)
- [ ] Wire `useGatewayEvent("chat", ...)` to store
- [ ] Delta → stream text replacement
- [ ] Final → history reload → tool stream reset
- [ ] Abort/error handling with UI feedback

### M3: Composer + Queue
- [ ] `ChatComposer` with auto-resize textarea
- [ ] Keyboard shortcuts (Enter, Shift+Enter, Cmd+Shift+Enter)
- [ ] Image paste handling with compression
- [ ] Drag-and-drop file attachment
- [ ] `AttachmentPreview` bar
- [ ] `QueueBar` with send-now, remove, clear-all
- [ ] Send → queue → flush logic

### M4: Tool Stream Visualization
- [ ] `handleAgentEvent` in store (tool stream processing)
- [ ] `ToolChip` component with icon/label/detail
- [ ] `ToolCardGroup` (collapsible group of chips)
- [ ] Tool display resolution (name → icon mapping)
- [ ] Tool output sidebar/detail view
- [ ] File preview integration (Write/Edit → open file)

### M5: Agent Session Panel
- [ ] `AgentSessionPanel` with active/history sections
- [ ] `SessionCard` with phase indicator + event timeline
- [ ] Phase detection from stream events
- [ ] `TerminalView` full event log
- [ ] `QuestionInput` for AskUserQuestion
- [ ] Kill/dismiss/refresh actions
- [ ] Staleness detection (60s no-event warning)

### M6: Polish + Edge Cases
- [ ] Reconnection: reload history, adopt run, resume tool stream
- [ ] Gap detection → history reload
- [ ] Compaction indicator toast
- [ ] Thinking/reasoning toggle
- [ ] Tool messages shown/hidden based on thinking level
- [ ] Internal system message filtering (GatewayRestart)
- [ ] Scroll position preservation on load-more
- [ ] "New messages" button when scrolled up
- [ ] Accessibility: `role="log"`, `aria-live="polite"`, keyboard nav

---

## 10. Dependencies

### npm Packages

```json
{
  "react-markdown": "^9.0.0",
  "remark-gfm": "^4.0.0",
  "react-syntax-highlighter": "^15.6.0",
  "zustand": "^5.0.0"
}
```

### From Track 1
- `useGateway()` hook — WebSocket client connection
- `useGatewayEvent(event, handler)` — subscribe to gateway events
- `useGatewayReconnect(handler)` — reconnection callback
- `GatewayClient` — `client.request(method, params)` for RPC

### From Track 2
- Panel system — `ChatPanel` mounts inside a panel slot
- Thread tabs — multiple `ChatPanel` instances, one per tab
- Panel layout — side-by-side chat + agent session panel

---

## 11. Key Design Decisions

1. **`react-markdown` over `marked` + `dangerouslySetInnerHTML`:** React-native rendering is safer, more composable, and avoids the `DOMPurify` dependency. For streaming (where partial markdown may be invalid), `react-markdown` handles it gracefully by rendering what it can.

2. **Zustand over React Context for chat state:** Per-thread stores need to persist across panel switches. Zustand stores live outside the React tree and can be subscribed to selectively, avoiding re-renders of the entire chat when only the stream text changes.

3. **Full-text delta replacement (not character-by-character):** The gateway sends the complete accumulated text on each delta. This is intentional — it handles out-of-order WebSocket messages and reconnection gracefully. The client just replaces `stream` if `next.length >= current.length`.

4. **Tool messages as synthetic chat items:** Tool stream entries are converted to message-shaped objects (`buildToolStreamMessage`) and merged into the chat item list for rendering. This keeps the rendering pipeline uniform — the same grouping and chip extraction logic works for both history messages and live tool events.

5. **50-message render limit with "load more":** Performance guard for long conversations. Messages beyond the limit exist in the store but aren't rendered. Clicking "Load more" extends the window by 50.

6. **Chip-only messages folded into assistant groups:** When a tool result has no text content (just a chip), it's merged into the preceding assistant group rather than creating a separate group. This keeps the visual flow clean — tool calls appear inline with the assistant's message.
