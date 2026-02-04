# SPEC: kOS Chat + Agent Integration (Track 4)

> **Covers:** KOS-13 (Chat Entry), KOS-5 (Agent Sessions)
> **Depends on:** Track 1 (scaffold + types), Track 2 (panel engine)
> **Directory:** `kos/src/renderer/src/`

## Goal

Build the chat UI that lives inside chat panels. Renders messages with the parts-based model, handles streaming, tool call visualization, grouped message rendering, reasoning/thinking blocks, image attachments, and the message queue. Also includes the coding session panel for monitoring CC/Codex agents.

## Reference

Port these patterns from the existing Lit UI (`ui/src/ui/`) into React:

- `chat/grouped-render.ts` → grouped message rendering
- `chat/tool-cards.ts` → tool call chips
- `chat/message-extract.ts` → text/thinking extraction
- `chat/message-normalizer.ts` → normalize raw gateway messages to ChatMessage
- `views/coding-panel.ts` → CC/Codex session monitoring
- `views/chat.ts` → compose bar, image paste, message queue

See also: `specs/kos-reference-patterns.md` for industry patterns to adopt.

## Components

```
src/renderer/src/components/chat/
├── ChatPanel.tsx             # Full chat view (messages + compose)
├── MessageList.tsx           # Scrollable message list with auto-scroll
├── MessageGroup.tsx          # Grouped consecutive same-role messages
├── MessageBubble.tsx         # Single message bubble
├── MessageParts.tsx          # Renders parts[] array (switch on type)
├── TextPart.tsx              # Markdown-rendered text
├── ToolCallChip.tsx          # Compact tool call/result chip
├── ToolCallGroup.tsx         # Collapsed group: "🔧 3 tool calls"
├── ReasoningBlock.tsx        # Collapsible thinking/reasoning
├── ImageAttachment.tsx       # Inline image display
├── AudioPlayer.tsx           # Inline audio playback
├── ComposeBar.tsx            # Message input + attachments
├── MessageQueue.tsx          # Queued messages when agent is busy
├── StreamingIndicator.tsx    # Three-dot reading indicator
└── hooks/
    ├── useMessages.ts        # Subscribe to thread messages via gateway
    ├── useStreaming.ts       # Track streaming state for a session
    └── useAutoScroll.ts      # Smart auto-scroll behavior

src/renderer/src/components/coding/
├── CodingSessionPanel.tsx    # CC/Codex session monitor panel
├── SessionCard.tsx           # Single coding session card
├── PhaseIndicator.tsx        # Phase badge (exploring/planning/building/testing)
├── SessionTimeline.tsx       # Event timeline within a session
└── hooks/
    └── useCodingSession.ts   # Parse coding session events from gateway
```

## Message Normalization

Gateway messages come in OpenClaw's internal format. Normalize to our `ChatMessage` type:

```ts
// src/renderer/src/gateway/normalize.ts

/**
 * Normalize a raw gateway message into our ChatMessage parts model.
 * Handles:
 * - OpenAI format (content string or content[] array)
 * - Anthropic format (content[] with text/image/tool_use/tool_result blocks)
 * - OpenClaw internal format (role + content + tool_calls)
 */
export function normalizeMessage(raw: unknown, threadId: string): ChatMessage {
  const m = raw as Record<string, unknown>;
  const parts: MessagePart[] = [];

  // Extract text content
  const text = extractText(m);
  if (text?.trim()) {
    parts.push({ type: "text", text });
  }

  // Extract thinking/reasoning
  const thinking = extractThinking(m);
  if (thinking?.trim()) {
    parts.push({ type: "reasoning", reasoning: thinking });
  }

  // Extract tool calls
  const toolCalls = extractToolCalls(m);
  for (const tc of toolCalls) {
    parts.push({
      type: "tool-call",
      toolCallId: tc.id,
      toolName: tc.name,
      args: tc.args,
      state: "complete",
    });
  }

  // Extract tool results (for tool role messages)
  if (isToolResultMessage(m)) {
    parts.push({
      type: "tool-result",
      toolCallId: m.tool_call_id ?? m.toolCallId ?? "",
      toolName: extractToolName(m),
      result: extractToolResult(m),
      isError: Boolean(m.is_error),
    });
  }

  // Extract images
  const images = extractImages(m);
  for (const img of images) {
    parts.push({ type: "image", url: img.url, alt: img.alt });
  }

  return {
    id: m.id ?? generateId(),
    role: normalizeRole(m.role),
    parts,
    createdAt: m.timestamp ?? Date.now(),
    threadId,
  };
}
```

## Message Grouping

Port the grouped rendering logic. Consecutive same-role messages group together:

```
┌─────────────────────────────────────────┐
│ 🤖 Bot                                  │
│                                          │
│   Let me check the auth flow...          │  ← TextPart (markdown)
│                                          │
│   🔧 3 tool calls  ▸                    │  ← ToolCallGroup (collapsed)
│                                          │
│   Found the issue. The token refresh     │  ← TextPart
│   endpoint is missing the `aud` claim.   │
│                                          │
│   ▸ Thought for 3.2s                    │  ← ReasoningBlock (collapsed)
│                                          │
│   Bot · 2:34 PM                          │  ← footer
└─────────────────────────────────────────┘
```

### MessageGroup.tsx

```tsx
function MessageGroup({ messages, role, isStreaming }: Props) {
  const { showReasoning } = useSettingsStore();

  // Batch consecutive tool-only messages into ToolCallGroups
  const rendered = useMemo(() => {
    const items: React.ReactNode[] = [];
    let toolBatch: ChatMessage[] = [];

    const flushTools = () => {
      if (toolBatch.length === 0) return;
      const count = toolBatch.reduce(
        (sum, m) =>
          sum + m.parts.filter((p) => p.type === "tool-call" || p.type === "tool-result").length,
        0,
      );
      items.push(
        <ToolCallGroup key={`tools-${items.length}`} messages={toolBatch} count={count} />,
      );
      toolBatch = [];
    };

    for (const msg of messages) {
      if (isToolOnlyMessage(msg)) {
        toolBatch.push(msg);
      } else {
        flushTools();
        items.push(
          <MessageBubble
            key={msg.id}
            message={msg}
            isStreaming={isStreaming && msg === messages.at(-1)}
          />,
        );
      }
    }
    flushTools();
    return items;
  }, [messages, isStreaming]);

  return (
    <div className={cn("flex gap-3", role === "user" ? "flex-row-reverse" : "")}>
      <Avatar role={role} />
      <div className="flex flex-col gap-1 max-w-[80%]">
        {rendered}
        <GroupFooter role={role} timestamp={messages[0]?.createdAt} />
      </div>
    </div>
  );
}
```

## Tool Call Chips

### ToolCallChip.tsx

Compact chip showing tool name + icon:

```
┌──────────────────────┐
│ 📖 Read  src/auth.ts │  ← tool-call chip
└──────────────────────┘
┌──────────────────────┐
│ ✏️ Edit  src/auth.ts │  ← tool-result chip (clickable → opens file)
└──────────────────────┘
┌────────────────────────────┐
│ ⚡ exec  npm test (3.2s)   │  ← exec with duration
└────────────────────────────┘
```

Icons by tool name:

- `Read` → 📖
- `Write` → 📝
- `Edit` → ✏️
- `exec` → ⚡
- `web_search` → 🔍
- `web_fetch` → 🌐
- `browser` → 🖥
- `message` → 💬
- Default → 🔧

Click behavior:

- File tools (Read/Write/Edit) → open file in code-editor panel (or update existing)
- exec with coding agent detection → open coding-session panel
- Other → open sidebar with full output

### ToolCallGroup.tsx

Collapsed by default:

```tsx
function ToolCallGroup({ messages, count }: Props) {
  const [open, setOpen] = useState(false);

  // Extract file paths from Write/Edit results for action buttons
  const filePaths = useMemo(() => extractFilePaths(messages), [messages]);

  return (
    <div>
      <button onClick={() => setOpen(!open)} className="tool-collapse-trigger">
        <WrenchIcon className="w-3.5 h-3.5" />
        <span>
          {count} tool call{count !== 1 ? "s" : ""}
        </span>
        <ChevronIcon className={cn("w-3 h-3 transition-transform", open && "rotate-90")} />
      </button>
      {open && (
        <div className="flex flex-wrap gap-1 mt-1">
          {messages.flatMap((m) =>
            m.parts
              .filter((p) => p.type === "tool-call" || p.type === "tool-result")
              .map((p) => <ToolCallChip key={p.toolCallId} part={p} />),
          )}
        </div>
      )}
      {filePaths.length > 0 && (
        <div className="flex gap-1 mt-1">
          {filePaths.map((fp) => (
            <FileActionButton key={fp} filePath={fp} />
          ))}
        </div>
      )}
    </div>
  );
}
```

## Markdown Rendering

### TextPart.tsx

```tsx
import { marked } from "marked";
import DOMPurify from "dompurify";
import hljs from "highlight.js/lib/core";

// Register common languages
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import python from "highlight.js/lib/languages/python";
import bash from "highlight.js/lib/languages/bash";
import json from "highlight.js/lib/languages/json";
import css from "highlight.js/lib/languages/css";
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("python", python);
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("json", json);
hljs.registerLanguage("css", css);

// Configure marked with highlight.js
marked.setOptions({
  highlight(code, lang) {
    if (lang && hljs.getLanguage(lang)) {
      return hljs.highlight(code, { language: lang }).value;
    }
    return hljs.highlightAuto(code).value;
  },
});

function TextPart({ text, isStreaming }: { text: string; isStreaming?: boolean }) {
  const html = useMemo(() => {
    if (isStreaming && text.length < 100) {
      // Simple render during early streaming (no markdown overhead)
      return DOMPurify.sanitize(text.replace(/\n/g, "<br>"));
    }
    return DOMPurify.sanitize(marked.parse(text));
  }, [text, isStreaming]);

  return (
    <div
      className="prose prose-sm dark:prose-invert max-w-none"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
```

Code blocks get a copy button:

```tsx
// Post-process: inject copy button into <pre><code> blocks
// Use a MutationObserver or post-render DOM walk
```

## Reasoning Block

### ReasoningBlock.tsx

```tsx
function ReasoningBlock({ reasoning, durationMs }: Props) {
  const [open, setOpen] = useState(false);
  const durationStr = durationMs ? `${(durationMs / 1000).toFixed(1)}s` : "";

  return (
    <div className="reasoning-block">
      <button onClick={() => setOpen(!open)} className="reasoning-trigger">
        <BrainIcon className="w-3.5 h-3.5 text-purple-400" />
        <span className="text-xs text-muted-foreground">
          {open ? "Hide reasoning" : `Thought${durationStr ? ` for ${durationStr}` : ""}...`}
        </span>
        <ChevronIcon className={cn("w-3 h-3 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="mt-1 pl-4 border-l-2 border-purple-400/30 text-sm text-muted-foreground">
          <TextPart text={reasoning} />
        </div>
      )}
    </div>
  );
}
```

## Compose Bar

### ComposeBar.tsx

```
┌─────────────────────────────────────────────────┐
│ [📎]  Type a message...                   [Send] │
│       ┌──────┐ ┌──────┐                         │
│       │ img1 │ │ img2 │  ← attachment previews   │
│       └──┬───┘ └──┬───┘                         │
│          ✕        ✕                              │
└─────────────────────────────────────────────────┘
```

Features:

- Auto-resizing textarea (grows up to 200px, then scrolls)
- `Enter` = send, `Shift+Enter` = newline
- `Cmd+Shift+Enter` = send immediately (interrupt current agent run)
- Image paste from clipboard (with compression — port from existing UI)
- Drag-and-drop file attachment
- Attachment preview thumbnails with remove button
- Slash command autocomplete (`/` trigger — show available commands from gateway)
- Disable send button when disconnected or empty

```tsx
function ComposeBar({ threadId, sessionKey }: Props) {
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const { isStreaming } = useStreaming(sessionKey);
  const { request } = useGateway();

  const send = async (immediate = false) => {
    if (!text.trim() && attachments.length === 0) return;

    if (isStreaming && !immediate) {
      // Queue the message
      addToQueue(threadId, text, attachments);
      setText("");
      setAttachments([]);
      return;
    }

    if (immediate && isStreaming) {
      // Abort current run, then send
      await request("session.abort", { sessionKey });
    }

    await request("session.sendMessage", {
      sessionKey,
      message: text,
      attachments: attachments.map((a) => a.payload),
    });

    setText("");
    setAttachments([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(e.metaKey && e.shiftKey);
    }
    if (e.key === "Enter" && e.metaKey && e.shiftKey) {
      e.preventDefault();
      send(true); // immediate
    }
  };

  // ... paste handler, drag-drop handler, slash autocomplete
}
```

### Image Compression (port from existing)

```ts
// src/renderer/src/lib/image-compress.ts
// Port from ui/src/ui/views/chat.ts image handling:
// - Max 1568px dimension
// - JPEG quality stepping (0.92 → 0.85 → 0.75 → 0.60)
// - 4MB budget
// - Transparency detection (keep PNG if alpha channel, else JPEG)
// - Returns { dataUrl, mimeType, width, height }
```

## Message Queue

### MessageQueue.tsx

When agent is busy (streaming), messages queue up:

```
┌─────────────────────────────────────────┐
│ Queued messages (2)                      │
│ ┌──────────────────────────────────┐    │
│ │ "fix the type error too" · 2:35  │ ✕  │
│ └──────────────────────────────────┘    │
│ ┌──────────────────────────────────┐    │
│ │ "and run tests" · 2:36          │ ✕  │
│ └──────────────────────────────────┘    │
│ [Send Now] [Clear All]                   │
└─────────────────────────────────────────┘
```

- Shows above compose bar when queue is non-empty
- Each item: message text (truncated) + timestamp + remove button
- "Send Now" = abort current run + send first queued message
- "Clear All" = discard queue
- When agent finishes streaming → auto-send first queued message

## Auto-Scroll

### useAutoScroll.ts

```ts
function useAutoScroll(containerRef: RefObject<HTMLElement>, deps: unknown[]) {
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [hasNewMessages, setHasNewMessages] = useState(false);

  // IntersectionObserver on a sentinel element at the bottom
  // When sentinel is visible → isAtBottom = true
  // When new messages arrive and isAtBottom → smooth scroll to bottom
  // When scrolled up and new messages arrive → show "New messages" badge

  return { isAtBottom, hasNewMessages, scrollToBottom };
}
```

## Streaming

### useStreaming.ts

```ts
function useStreaming(sessionKey: string) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");

  useGatewayEvent("session.stream.start", (payload) => {
    if (payload.sessionKey === sessionKey) {
      setIsStreaming(true);
      setStreamText("");
    }
  });

  useGatewayEvent("session.stream.delta", (payload) => {
    if (payload.sessionKey === sessionKey) {
      setStreamText((prev) => prev + payload.text);
    }
  });

  useGatewayEvent("session.stream.end", (payload) => {
    if (payload.sessionKey === sessionKey) {
      setIsStreaming(false);
      setStreamText("");
    }
  });

  return { isStreaming, streamText };
}
```

During streaming, the last message group shows a live-updating bubble. If stream is empty, show the three-dot reading indicator.

## Coding Session Panel

### CodingSessionPanel.tsx

Monitor CC/Codex sessions in real-time. This is unique to kOS.

```
┌─────────────────────────────────────────┐
│ Coding Session: auth-refactor            │
│ 🔨 Building · 4m 23s                    │
├─────────────────────────────────────────┤
│                                          │
│ 🔍 Exploring (12s)                      │
│   Read src/auth/middleware.ts             │
│   Read src/auth/token.ts                 │
│   Read src/auth/types.ts                 │
│                                          │
│ 🧠 Planning (8s)                         │
│   "I'll refactor the token refresh..."   │
│                                          │
│ 🔨 Building (ongoing)                   │
│   Edit src/auth/middleware.ts             │
│   Write src/auth/refresh.ts              │
│   Edit src/auth/types.ts                 │
│                                          │
└─────────────────────────────────────────┘
```

Phase detection from tool stream events:

- **Exploring** 🔍 (blue): Read, web_search, web_fetch tools
- **Planning** 🧠 (purple): Long text output with no tool calls
- **Building** 🔨 (amber): Write, Edit, exec tools
- **Testing** 🧪 (green): exec with test-like commands (npm test, pytest, etc.)
- **Complete** ✅ (green): Session ended successfully
- **Error** ❌ (red): Session ended with error

```tsx
function CodingSessionPanel({ sessionKey }: Props) {
  const { events, phase, duration } = useCodingSession(sessionKey);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2 border-b">
        <PhaseIndicator phase={phase} />
        <span className="text-sm font-medium">{sessionLabel}</span>
        <span className="text-xs text-muted-foreground ml-auto">{formatDuration(duration)}</span>
      </div>
      <ScrollArea className="flex-1">
        <SessionTimeline events={events} />
      </ScrollArea>
    </div>
  );
}
```

### useCodingSession.ts

Parse gateway events for a coding session:

```ts
interface CodingEvent {
  type: "tool-call" | "tool-result" | "text" | "phase-change";
  toolName?: string;
  args?: Record<string, unknown>;
  text?: string;
  phase: CodingPhase;
  timestamp: number;
}

type CodingPhase = "exploring" | "planning" | "building" | "testing" | "complete" | "error";

function detectPhase(toolName: string, args: Record<string, unknown>): CodingPhase {
  if (["Read", "web_search", "web_fetch"].includes(toolName)) return "exploring";
  if (["Write", "Edit"].includes(toolName)) return "building";
  if (toolName === "exec") {
    const cmd = String(args.command ?? "");
    if (/\b(test|spec|jest|pytest|vitest|mocha)\b/i.test(cmd)) return "testing";
    return "building";
  }
  return "exploring";
}
```

## Gateway Message Subscription

### useMessages.ts

```ts
function useMessages(sessionKey: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  // On mount: fetch history via gateway RPC
  useEffect(() => {
    gateway.request("session.history", { sessionKey, limit: 100 }).then((history) => {
      setMessages(history.messages.map((m) => normalizeMessage(m, threadId)));
    });
  }, [sessionKey]);

  // Subscribe to new messages
  useGatewayEvent("session.message", (payload) => {
    if (payload.sessionKey === sessionKey) {
      setMessages((prev) => [...prev, normalizeMessage(payload.message, threadId)]);
    }
  });

  return messages;
}
```

## Dependencies to Install

```
npm i marked dompurify highlight.js
npm i -D @types/dompurify
```

## Acceptance Criteria

1. Chat panel renders messages with grouped rendering (consecutive same-role = one group)
2. Tool calls collapse into "🔧 N tool calls" with expand/collapse
3. Tool chips show correct icons per tool type
4. Click file tool chip → emits event to open file in code-editor panel
5. Markdown renders with syntax highlighting in code blocks
6. Code blocks have a copy button
7. Reasoning blocks are collapsed by default, expand on click
8. Images render inline, clickable to open full-size
9. Compose bar: Enter sends, Shift+Enter newlines, Cmd+Shift+Enter sends immediately
10. Image paste from clipboard compresses and shows preview
11. Message queue shows when agent is streaming, auto-sends on completion
12. Auto-scroll follows new messages, pauses when user scrolls up
13. Three-dot reading indicator shows during empty stream
14. Streaming text renders live with markdown
15. Coding session panel shows phase timeline with color-coded phases
16. Connected to a running gateway → messages flow in real-time

## Do NOT

- Do not implement conversation branching (v2)
- Do not implement message editing/regeneration (v2)
- Do not implement voice input/output
- Do not implement Mermaid diagrams
- Do not implement KaTeX math rendering (v1.x)
- Do not implement the auto-open-panel trigger (that's in Track 2's adaptive system)
- Do not build the coding session Q&A/approval UI (just the monitoring view)
