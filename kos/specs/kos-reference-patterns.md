# kOS Reference Patterns — Gold-Standard AI Chat Interfaces

> **Purpose:** Reference document for implementation agents (CC/Codex) building the kOS web UI.
> **Last updated:** 2026-02-02
> **Author:** Research subagent

---

## Table of Contents

1. [Executive Summary & Recommendations](#1-executive-summary--recommendations)
2. [Vercel AI Chatbot (Chat SDK)](#2-vercel-ai-chatbot-chat-sdk)
3. [Vercel AI SDK](#3-vercel-ai-sdk)
4. [Open WebUI](#4-open-webui)
5. [LobeHub (formerly Lobe Chat)](#5-lobehub-formerly-lobe-chat)
6. [NextChat (ChatGPT-Next-Web)](#6-nextchat-chatgpt-next-web)
7. [LibreChat](#7-librechat)
8. [shadcn AI Components](#8-shadcn-ai-components)
9. [Our Fork (OpenClaw Kinetic UI)](#9-our-fork-openclaw-kinetic-ui)
10. [Cross-Cutting Pattern Analysis](#10-cross-cutting-pattern-analysis)
11. [Adoption Matrix](#11-adoption-matrix)

---

## 1. Executive Summary & Recommendations

### Top-Level Takeaways

| Pattern                       | Best Reference                         | Adopt?      | Notes                               |
| ----------------------------- | -------------------------------------- | ----------- | ----------------------------------- |
| **Message parts model**       | Vercel AI SDK                          | ✅ YES      | Gold standard typed `parts[]` model |
| **Tool call visualization**   | shadcn AI + our fork                   | ✅ YES      | Collapsible chips + sidebar         |
| **Streaming markdown**        | Open WebUI (marked.js + custom tokens) | ✅ YES      | Best streaming perf                 |
| **Grouped message rendering** | Our fork                               | ✅ KEEP     | Already excellent                   |
| **Split-pane layout**         | Our fork                               | ✅ KEEP     | Binary tree is unique & powerful    |
| **Coding panel**              | Our fork                               | ✅ KEEP     | No equivalent elsewhere             |
| **State management**          | Zustand (LobeHub pattern)              | ⚠️ EVALUATE | If migrating to React               |
| **Component library**         | shadcn/ui                              | ✅ YES      | If migrating to React               |
| **Branching conversations**   | LibreChat / LobeHub                    | ⚠️ FUTURE   | Not needed for v1                   |
| **Artifact panel**            | Our fork + LobeHub                     | ✅ KEEP     | Ours is more integrated             |

### Architecture Decision: Lit vs React

Our fork uses **Lit** (web components + lit-html). The entire OSS ecosystem uses **React** (or Svelte for Open WebUI). The kOS decision depends on:

- **Stay with Lit:** Keep existing fork code, smaller bundle, web-component portability. But: smaller ecosystem, no shadcn, no AI SDK hooks.
- **Migrate to React:** Access to AI SDK `useChat`, shadcn components, larger talent pool. But: full rewrite, larger bundle.

**Recommendation:** If kOS is a ground-up rewrite, **adopt React + AI SDK + shadcn** as the foundation. Port the _patterns_ from our Lit fork (grouped rendering, tool chips, split panes, coding panel) into React components. The patterns are more valuable than the Lit implementation.

---

## 2. Vercel AI Chatbot (Chat SDK)

- **Repo:** https://github.com/vercel/ai-chatbot
- **Stars:** ~15k (as of 2026-02)
- **Last updated:** Actively maintained (weekly commits)
- **License:** MIT

### Tech Stack

- **Framework:** Next.js App Router (React Server Components + Server Actions)
- **Styling:** Tailwind CSS + shadcn/ui (Radix primitives)
- **State:** AI SDK `useChat` hook (client), React Server Components (server)
- **DB:** Neon Serverless Postgres
- **Storage:** Vercel Blob
- **Auth:** Auth.js

### Message Rendering

Messages use the AI SDK's **parts-based model**:

```tsx
// Each message has typed parts
message.parts.map((part, i) => {
  switch (part.type) {
    case "text":
      return <MessageResponse key={i}>{part.text}</MessageResponse>;
    case "tool-call":
      return <Tool key={i} name={part.toolName} status="complete" />;
    case "reasoning":
      return <Reasoning key={i}>{part.reasoning}</Reasoning>;
    case "tool-getWeather":
      return <WeatherCard key={i} invocation={part} />;
  }
});
```

Key files:

- `components/message.tsx` — Message rendering with parts iteration
- `components/chat.tsx` — Main chat container
- `app/api/chat/route.ts` — Streaming API route

### Streaming

- Uses AI SDK's `streamText()` → `toUIMessageStreamResponse()`
- Client receives typed parts via `useChat` hook
- Text streams token-by-token into `MessageResponse` component
- Tool call inputs can stream partially (`input-streaming` state)

### Tool Calls

Tool invocations have **four states**, rendered as typed parts:

1. `input-streaming` — Tool args being generated (show skeleton/loading)
2. `input-available` — Args complete, executing (show args + spinner)
3. `output-available` — Result ready (show result UI)
4. `output-error` — Execution failed (show error)

```tsx
case 'tool-askForConfirmation': {
  switch (part.state) {
    case 'input-streaming':
      return <div>Loading confirmation request...</div>;
    case 'input-available':
      return <ConfirmationDialog message={part.input.message} />;
    case 'output-available':
      return <div>Confirmed: {part.output}</div>;
  }
}
```

### Code Blocks

- shadcn/ui code component with Tailwind styling
- Copy button on hover
- Language detection via fenced code block markers

### Markdown Rendering

- `react-markdown` with remark/rehype plugins
- GFM support (tables, strikethrough, task lists)
- Sanitization via rehype-sanitize

### Attachments

- Vercel Blob for file storage
- Image paste, file upload
- Attachments sent as multipart alongside messages

### Auto-Scroll

- Scroll-to-bottom on new messages
- User scroll-up pauses auto-scroll
- "New messages" indicator when scrolled up

### ✅ Adopt from This

- **Parts-based message model** — The typed `part.type` switch pattern is the cleanest approach
- **Tool invocation state machine** (4 states) — Directly applicable to kOS
- **`sendAutomaticallyWhen`** — Auto-submit when all tool results available

### ❌ Skip

- **Neon/Vercel Blob** — Infrastructure-specific, not relevant
- **RSC/Server Actions** — Only makes sense on Vercel hosting

---

## 3. Vercel AI SDK

- **Repo:** https://github.com/vercel/ai
- **Stars:** ~70k+
- **Last updated:** Continuously (multi-commit daily)
- **License:** Apache 2.0

### Key Patterns for kOS

#### The `useChat` Hook

```tsx
import { useChat } from "@ai-sdk/react";

const { messages, status, sendMessage, addToolOutput } = useChat<AgentMessage>();
```

Returns:

- `messages` — Array of `UIMessage` with typed `parts[]`
- `status` — `'ready' | 'submitted' | 'streaming'`
- `sendMessage()` — Send user message
- `addToolOutput()` — Provide tool results (for client-side tools)
- `input` / `setInput` — Controlled input state

#### Streaming Protocol (AI UI Stream)

The SDK defines a wire protocol for streaming AI responses:

```
0:"Hello "          ← text delta
0:"world"           ← text delta
9:{"toolCallId":"xyz","toolName":"getWeather","args":{"city":"NYC"}}  ← tool call
a:{"toolCallId":"xyz","result":{"temp":72}}  ← tool result
e:{"finishReason":"stop","usage":{"promptTokens":10,"completionTokens":20}}
```

Each line is `type_code:json_payload`. This allows:

- Progressive rendering of text
- Tool calls appearing mid-stream
- Reasoning/thinking tokens separate from text

#### Tool Call Rendering (AI SDK 5/6 Pattern)

```tsx
// Agent definition (server)
export const myAgent = new ToolLoopAgent({
  model: 'anthropic/claude-sonnet-4.5',
  tools: { generateImage: openai.tools.imageGeneration() },
});

// Type-safe message type
export type MyAgentMessage = InferAgentUIMessage<typeof myAgent>;

// Client: typed tool parts
case 'tool-generateImage':
  return <ImageGenerationView invocation={part} />;
```

The `InferAgentUIMessage` type ensures compile-time safety between server tool definitions and client rendering.

### ✅ Adopt from This

- **`useChat` hook pattern** — Best abstraction for chat state management
- **Streaming wire protocol** — If building custom transport, this is the standard
- **`InferAgentUIMessage` type pattern** — Type-safe tool rendering
- **`sendAutomaticallyWhen` + `lastAssistantMessageIsCompleteWithToolCalls`** — Auto-continuation

### ❌ Skip

- **`ToolLoopAgent`** — Server-side, not relevant to UI
- **Provider architecture** — We have our own gateway

---

## 4. Open WebUI

- **Repo:** https://github.com/open-webui/open-webui
- **Stars:** ~75k+ (most starred AI chat UI)
- **Last updated:** Daily commits
- **License:** BSD-3-Clause

### Tech Stack

- **Frontend:** SvelteKit
- **Backend:** Python (FastAPI)
- **Markdown:** `marked.js` with custom extensions (KaTeX, citations, footnotes, mentions, alerts)
- **Code highlighting:** Custom Svelte components wrapping highlight.js/Prism
- **State:** Svelte stores (reactive)
- **DB:** SQLite (default) or PostgreSQL

### Message Rendering

Open WebUI uses a **recursive Svelte component tree** for markdown:

```
Chat.svelte
  └── Messages.svelte
       └── ResponseMessage.svelte / UserMessage.svelte
            └── Markdown/MarkdownTokens.svelte  (recursive)
                 ├── CodeBlock.svelte
                 ├── KatexRenderer.svelte
                 ├── MarkdownInlineTokens.svelte
                 └── ... (20+ token type components)
```

Key files:

- `src/lib/components/chat/Messages/` — Message components
- `src/lib/components/chat/Messages/Markdown/` — Markdown rendering system
- `src/lib/components/chat/MessageInput/` — Input with file upload, voice, etc.

### Streaming

- SSE (Server-Sent Events) from FastAPI backend
- Token-by-token rendering into Svelte reactive store
- `marked.js` re-parses on each new chunk (with caching for completed blocks)
- Smooth cursor animation at end of stream

### Tool Calls / Function Calls

- Tool calls shown as expandable sections in message
- Status indicators: loading → running → complete/error
- Results displayed inline or in collapsible cards
- Multi-step tool chains visualized sequentially

### Code Blocks

- Custom `CodeBlock.svelte` component
- highlight.js for syntax highlighting (lazy-loaded per language)
- Copy button (top-right)
- Language label (top-left)
- Run button for Python code (via Code Interpreter)

### Markdown Rendering

- **Library:** `marked.js` with extensive custom extensions
- **Math:** KaTeX (custom `marked` extension tokenizer + renderer)
- **Tables:** GFM tables with horizontal scroll wrapper
- **Images:** Inline rendering with lightbox on click
- **Mermaid:** Supported via custom token type
- **Token pipeline:** `marked.lexer()` → custom token tree → recursive Svelte components

This is the most sophisticated markdown rendering in the OSS space.

### Attachments

- File upload (drag-and-drop, paste, button)
- Image preview thumbnails before send
- Document upload for RAG (`#` command to reference)
- Web URL injection (`#url` syntax)

### Auto-Scroll

- Auto-scroll to bottom during streaming
- Scroll-up detection pauses auto-scroll
- "Scroll to bottom" button appears when scrolled up
- Smooth scroll animation

### State Management

- Svelte writable stores for chat state
- Per-conversation state
- WebSocket for real-time updates

### ✅ Adopt from This

- **`marked.js` with custom extensions** — Best approach for streaming markdown
- **Recursive token rendering** — Clean separation of token types
- **KaTeX integration pattern** — If we need math support
- **Code block with run button** — Executable code blocks pattern
- **RAG `#` command syntax** — If we add knowledge base features

### ❌ Skip

- **SvelteKit** — Different framework
- **Python backend** — We have our own
- **Full recursive token tree** — May be over-engineered for v1 (our `marked.parse()` + DOMPurify is simpler and works)

---

## 5. LobeHub (formerly Lobe Chat)

- **Repo:** https://github.com/lobehub/lobe-chat (redirects to lobehub/lobehub)
- **Stars:** ~55k+
- **Last updated:** Daily commits
- **License:** Apache 2.0

### Tech Stack

- **Framework:** Next.js (App Router)
- **Styling:** Ant Design + `@lobehub/ui` custom component library
- **State:** Zustand (with middleware for persistence)
- **DB:** IndexedDB (client-side, default) or PostgreSQL (server mode)
- **Auth:** Auth.js / NextAuth

### Message Rendering

LobeHub uses a **slice-based Zustand store** pattern:

```
src/store/chat/
  ├── slices/
  │   ├── message/     — message CRUD, streaming state
  │   ├── topic/       — conversation topics
  │   ├── plugin/      — plugin/tool state
  │   └── share/       — export/share state
  └── store.ts         — combines slices
```

Messages rendered via:

```
ChatList → ChatItem → MessageContent → MarkdownRender
                   → PluginRender (for tool results)
                   → FileRender (for attachments)
```

### Streaming

- Fetch-based streaming (SSE or data stream)
- Token-by-token into Zustand store
- React memoization prevents re-renders of completed messages
- Smooth animation on streaming text

### Tool Calls / Plugin Visualization

This is LobeHub's standout feature:

```
PluginRender
  ├── PluginDefaultType    — generic JSON result card
  ├── PluginStandaloneType — full iframe sandbox for plugin UI
  └── Plugin components/   — custom renderers per plugin
```

- Each plugin can register a **custom React component** for rendering
- Plugin results show as cards with expand/collapse
- Status indicators: queued → running → complete → error
- Tool arguments shown in collapsible "Details" section
- Plugin marketplace with one-click install

### Markdown Rendering

- `react-markdown` + `rehype-highlight` + `rehype-katex`
- Custom components for code blocks, tables, images
- Mermaid diagram support
- Citation rendering

### State Management (Zustand)

This is the most well-architected state pattern among the references:

```ts
// Slice pattern
const createMessageSlice = (set, get) => ({
  messages: [],
  activeId: null,
  streaming: false,

  sendMessage: async (content) => {
    set({ streaming: true });
    // ... streaming logic
    set({ streaming: false });
  },

  deleteMessage: (id) => {
    set((state) => ({
      messages: state.messages.filter((m) => m.id !== id),
    }));
  },
});

// Combined store
const useChatStore = create(
  persist(
    (...a) => ({
      ...createMessageSlice(...a),
      ...createTopicSlice(...a),
      ...createPluginSlice(...a),
    }),
    { name: "lobe-chat" },
  ),
);
```

### Branching Conversations

- Supports conversation forking
- Tree-based message history
- Navigate between branches

### ✅ Adopt from This

- **Zustand slice pattern** — If using React, this is the cleanest state architecture
- **Plugin render system** — Custom renderers per tool type
- **Agent session management** — Agent marketplace + session isolation
- **MCP plugin one-click install** — Great UX pattern

### ❌ Skip

- **Ant Design** — Heavy, prefer shadcn/ui
- **IndexedDB client-side storage** — We have server-side state
- **Over-engineered folder structure** — 100+ files in store/ alone

---

## 6. NextChat (ChatGPT-Next-Web)

- **Repo:** https://github.com/ChatGPTNextWeb/NextChat
- **Stars:** ~80k+ (most starred overall)
- **Last updated:** Regular commits
- **License:** MIT

### Tech Stack

- **Framework:** Next.js
- **Desktop:** Tauri (Rust-based, ~5MB client)
- **State:** Zustand
- **Styling:** CSS Modules + SCSS
- **Markdown:** `react-markdown` with lazy loading

### Key Patterns

#### Ultra-Lightweight Bundle

- ~100KB first-screen load
- Lazy-loaded markdown rendering
- Code splitting per route
- This is the benchmark for performance

#### Markdown Rendering

- `react-markdown` + `remark-gfm` + `remark-math`
- `rehype-katex` for LaTeX
- `rehype-highlight` for code
- Mermaid support
- **Lazy loading:** Markdown renderer loaded on demand

```tsx
// Lazy-loaded markdown with streaming support
const Markdown = lazy(() => import("./markdown"));

// During streaming, uses simpler renderer
{
  isStreaming ? <SimpleText text={content} /> : <Markdown content={content} />;
}
```

#### Conversation Masks (Templates)

- Pre-defined "masks" with system prompts
- Users can create, share, import masks
- Each mask defines: avatar, name, system prompt, model settings

#### Artifacts

- Generated content (HTML, React, Mermaid) rendered in separate panel
- Preview, copy, share functionality
- Similar pattern to our artifact panel

### ✅ Adopt from This

- **Lazy-loaded markdown** — Critical for performance during streaming
- **Simple renderer during streaming, full renderer when complete** — Great optimization
- **Tauri desktop packaging** — If we need native distribution
- **~100KB first load** — Performance benchmark

### ❌ Skip

- **CSS Modules + SCSS** — Prefer Tailwind
- **Mask system** — We have agent configs
- **Client-side only storage** — We have server state

---

## 7. LibreChat

- **Repo:** https://github.com/danny-avila/LibreChat
- **Stars:** ~25k+
- **Last updated:** Very active (daily)
- **License:** MIT

### Tech Stack

- **Frontend:** React (Vite)
- **Backend:** Node.js (Express)
- **State:** React Query (TanStack Query) + Recoil
- **Styling:** Tailwind CSS
- **DB:** MongoDB

### Notable UI Patterns

#### Conversation Branching

LibreChat's standout feature:

- Edit any message → creates a branch
- Navigate branches with Previous/Next buttons ("2 of 3")
- Full tree visualization of conversation history
- Fork conversations from any point

#### Resumable Streams

- If connection drops, response automatically reconnects
- Works across tabs and devices (Redis-backed)
- Production-grade streaming infrastructure

#### Reasoning UI

- Dynamic reasoning display for CoT models (DeepSeek-R1, o1)
- Collapsible "Thought for X seconds" blocks
- Auto-collapse when streaming finishes

#### Code Artifacts

- React/HTML/Mermaid rendered in sandboxed preview
- Side-by-side code + preview
- Live editing

### ✅ Adopt from This

- **Conversation branching UI** — For future implementation
- **Resumable streams** — Production-critical feature
- **Reasoning UI pattern** — "Thought for X seconds" with auto-collapse
- **React Query for API state** — Clean separation of server state

### ❌ Skip

- **MongoDB** — Different storage layer
- **Recoil** — Deprecated-ish, prefer Zustand
- **Express backend** — We have our own

---

## 8. shadcn AI Components

- **URL:** https://www.shadcn.io/ai
- **Type:** Component library (copy-paste, not npm package)
- **Framework:** React + Tailwind + Radix

### Component Inventory

**25+ purpose-built components for conversational AI:**

#### Core Chat

- `Conversation` / `ConversationContent` — Container
- `Message` / `MessageContent` / `MessageResponse` — Message rendering
- `MessageActions` — Copy, regenerate, branch
- `TypingIndicator` — Animated dots

#### AI-Specific

- `Tool` — Tool call display (name, status, inputs, output)
- `Reasoning` — Collapsible thinking blocks
- `Citation` / `Citations` — Source attribution
- `Branching` — Message version navigation

#### Input

- `Composer` — Rich input with attachments
- `PromptSuggestions` — Quick-start prompts
- `FilePreview` — Attachment thumbnails
- `AudioVisualizer` — Voice input display

#### Content

- `CodeBlock` — Syntax highlighting + copy
- `Artifact` — Generated content preview
- `MarkdownRenderer` — Streaming-safe markdown

### Integration Pattern

```tsx
import { Message, MessageContent, MessageResponse } from "@/components/ai/message";
import { Conversation, ConversationContent } from "@/components/ai/conversation";
import { Tool } from "@/components/ai/tool";
import { Reasoning } from "@/components/ai/reasoning";
import { useChat } from "@ai-sdk/react";

export default function Chat() {
  const { messages } = useChat();
  return (
    <Conversation>
      <ConversationContent>
        {messages.map((message) => (
          <Message from={message.role} key={message.id}>
            <MessageContent>
              {message.parts?.map((part, i) => {
                if (part.type === "text")
                  return <MessageResponse key={i}>{part.text}</MessageResponse>;
                if (part.type === "tool-call")
                  return <Tool key={i} name={part.toolName} status="complete" />;
                if (part.type === "reasoning")
                  return <Reasoning key={i}>{part.reasoning}</Reasoning>;
              })}
            </MessageContent>
          </Message>
        ))}
      </ConversationContent>
    </Conversation>
  );
}
```

### ✅ Adopt from This

- **All of it** — If going React, this is the starting point
- **Component architecture** — Clean separation of concerns
- **AI SDK integration** — First-class `parts[]` support
- **Copy-paste ownership** — Full customization control

---

## 9. Our Fork (OpenClaw Kinetic UI)

### Tech Stack

- **Framework:** Lit (lit-html templates, web components)
- **Styling:** CSS (custom properties for theming)
- **Markdown:** `marked.js` + DOMPurify
- **State:** Module-scoped maps + props-down/events-up

### Architecture Overview

```
ui/src/ui/
├── views/
│   ├── chat.ts                  — Main chat view (message list + compose)
│   ├── coding-panel.ts          — Claude Code session monitor
│   ├── artifact-panel.ts        — File preview/edit panel
│   ├── split-pane-container.ts  — Binary tree split layout
│   ├── thread-list.ts           — Session/thread sidebar
│   ├── markdown-sidebar.ts      — Tool output viewer
│   ├── tool-approval.ts         — Human-in-the-loop approval UI
│   └── slash-autocomplete.ts    — Slash command completion
├── chat/
│   ├── grouped-render.ts        — Message grouping + rendering
│   ├── message-normalizer.ts    — Raw message → normalized shape
│   ├── message-extract.ts       — Text/thinking extraction with caching
│   ├── tool-cards.ts            — Tool call/result chip rendering
│   ├── tool-helpers.ts          — Tool output formatting
│   ├── copy-as-markdown.ts      — Copy button for messages
│   └── constants.ts             — Thresholds and limits
├── markdown.ts                  — marked.js + DOMPurify rendering
├── components/
│   ├── resizable-divider.ts     — Drag-to-resize for split panes
│   └── markdown-editor.ts       — WYSIWYG markdown editor
└── types/
    └── chat-types.ts            — TypeScript types for chat
```

### Patterns to KEEP (Carry Forward)

#### 1. Grouped Message Rendering ✅ KEEP

Our fork groups consecutive same-role messages into visual clusters:

```ts
// chat/grouped-render.ts
// Consecutive assistant messages → single group with avatar
// Tool result chips fold INTO preceding assistant group
function groupMessages(items: ChatItem[]): Array<ChatItem | MessageGroup> {
  // Groups by role, folds chip-only tool results into assistant groups
}
```

The `MessageGroup` renders as:

```
┌─────────────────────┐
│ 🤖 Avatar           │
│   ├── Text bubble 1  │
│   ├── Tool chips ▸   │  (collapsible: "3 tool calls")
│   ├── Text bubble 2  │
│   └── Timestamp      │
└─────────────────────┘
```

**Why keep:** This is cleaner than any OSS reference. Tool calls collapse into chips, file mutations auto-open preview, and the grouping logic handles edge cases well.

#### 2. Tool Card System ✅ KEEP

```ts
// chat/tool-cards.ts
type ToolCard = {
  kind: "call" | "result";
  name: string;
  args?: unknown;
  text?: string;
};

// Chips with icon + label + detail, clickable to open sidebar/file preview
renderToolCardSidebar(card, onOpenSidebar, onOpenFilePreview, onOpenCodingSession);
```

Features:

- Automatic icon resolution per tool type (📖 Read, ✏️ Edit, 📝 Write, ⚡ Bash, 🔍 Search)
- Detects coding agent exec calls → routes to coding panel
- Detects file tools → routes to artifact panel
- Consecutive tool results collapse into `<details>` with count: "🔧 3 tool calls"
- File action buttons after tool collapse for Write/Edit results

#### 3. Coding Panel ✅ KEEP (Unique)

No other OSS project has this. Real-time monitoring of coding agent sessions:

```ts
// views/coding-panel.ts
// Phase detection: init → exploring → planning → building → testing → complete
// Stream event parsing from Claude Code JSON output
// Interactive Q&A for AskUserQuestion tool calls
// Session cards with expand/collapse, timeline, terminal view
```

Phase indicators with colors: 🔍 Exploring (blue), 🧠 Planning (purple), 🔨 Building (amber), 🧪 Testing (green), ✅ Complete (green), ❌ Error (red)

#### 4. Split Pane Container ✅ KEEP (Unique)

Binary tree layout for multi-session views:

```ts
// views/split-pane-container.ts
type SplitNode = SplitBranch | SplitLeaf;
type SplitBranch = {
  kind: "branch";
  direction: "horizontal" | "vertical";
  ratio: number;
  first: SplitNode;
  second: SplitNode;
};
type SplitLeaf = { kind: "leaf"; id: string; sessionKey: string };
```

Recursive rendering with resizable dividers. Supports horizontal/vertical splits with configurable ratios (15%-85% range).

#### 5. Image Attachment System ✅ KEEP

Mature implementation:

- Clipboard paste detection
- Automatic compression (max 1568px, JPEG quality stepping)
- Transparency detection (keeps PNG if alpha, converts to JPEG if opaque)
- 4MB budget with progressive quality reduction
- Preview thumbnails with remove button

#### 6. Message Queue System ✅ KEEP

When agent is busy, messages queue up instead of being lost:

- Visual queue display with timestamps
- "Send now" (interrupt current run) and "Remove" per item
- Clear all queued
- Shift+Cmd+Enter to send immediately

#### 7. Streaming with Reading Indicator ✅ KEEP

```ts
// Empty stream → animated three-dot "reading" indicator
// Non-empty stream → live markdown rendering
// Stream + tool messages shown during active run
```

#### 8. Auto-Open File Preview ✅ KEEP

When Write/Edit tools complete, automatically opens the file in the artifact panel:

```ts
// Tracks already-opened paths to avoid re-render loops
const autoOpenedPaths = new Set<string>();
// On new Write/Edit result → queueMicrotask(() => open(filePath))
```

### Patterns to IMPROVE

#### 1. Markdown Rendering ⚠️ IMPROVE

Current: `marked.parse()` entire string → DOMPurify. Simple but:

- No syntax highlighting (just `<code>` with escaped HTML)
- No KaTeX/math support
- No Mermaid diagram support
- Re-parses entire content on each stream update
- 140K char limit before falling back to `<pre>`

**Recommendation:** Add `highlight.js` for code highlighting (lazy-loaded), consider KaTeX if math content is expected. For streaming, consider NextChat's pattern: simple renderer during streaming, full renderer when complete.

#### 2. Scroll Behavior ⚠️ IMPROVE

Current: CSS class toggle (`chat-main--scrolled-up`) at 200px threshold, manual scroll button.

**Recommendation:** Adopt smoother pattern:

- `IntersectionObserver` on a sentinel element at bottom
- Smooth `scrollTo` instead of jump
- "New messages" badge with count

#### 3. State Management ⚠️ EVALUATE

Current: Module-scoped `Map`s (e.g., `autocompleteStates`, `sessionRenderLimits`). Works in Lit but doesn't scale well.

**Recommendation if migrating to React:** Zustand with LobeHub's slice pattern. If staying with Lit: consider a reactive state container.

---

## 10. Cross-Cutting Pattern Analysis

### Message Model Comparison

| Project       | Message Model                 | Tool Calls In            | Typing                    |
| ------------- | ----------------------------- | ------------------------ | ------------------------- |
| Vercel AI SDK | `UIMessage { parts: Part[] }` | `parts[]` as typed parts | Full TypeScript generics  |
| Our Fork      | `Record<string, unknown>`     | `content[]` items        | Normalized at render time |
| Open WebUI    | Custom Svelte stores          | Inline in message        | Python + JS loose types   |
| LobeHub       | Zustand store with types      | Plugin result messages   | TypeScript interfaces     |
| NextChat      | Zustand store                 | Inline                   | TypeScript                |
| LibreChat     | MongoDB documents             | Nested in message        | TypeScript + React Query  |

**Verdict:** Adopt the AI SDK `UIMessage` model. It's the most type-safe and the industry is converging on it.

### Streaming Approaches

| Project       | Transport                   | Rendering Strategy                        |
| ------------- | --------------------------- | ----------------------------------------- |
| Vercel AI SDK | Custom data stream protocol | Token-by-token into typed parts           |
| Our Fork      | WebSocket/SSE               | Full string → `marked.parse()`            |
| Open WebUI    | SSE                         | Token-by-token → marked.js incremental    |
| LobeHub       | SSE/Fetch                   | Token-by-token → Zustand store            |
| NextChat      | SSE                         | Simple renderer during stream, full after |
| LibreChat     | SSE (resumable)             | Token-by-token with reconnection          |

**Verdict:** Our approach works but re-parsing full string on each token is wasteful. Adopt NextChat's dual-renderer or Open WebUI's incremental parsing.

### Tool Visualization Comparison

| Project           | Visualization                            | Interactivity                      |
| ----------------- | ---------------------------------------- | ---------------------------------- |
| Vercel AI Chatbot | Custom components per tool               | Full (buttons, forms in tool UI)   |
| Our Fork          | Collapsible chips + sidebar              | Click to open sidebar/file preview |
| Open WebUI        | Expandable sections                      | View results                       |
| LobeHub           | Plugin render system (custom components) | Full (iframe sandbox for plugins)  |
| NextChat          | Basic inline                             | Minimal                            |
| LibreChat         | Inline + artifacts                       | Code execution                     |

**Verdict:** Our chip system is good for the common case. For kOS, adopt the AI SDK pattern of custom components per tool type while keeping our chip fallback for generic tools.

### Keyboard Shortcuts

| Shortcut            | Vercel | Our Fork                | Open WebUI  | NextChat |
| ------------------- | ------ | ----------------------- | ----------- | -------- |
| Enter to send       | ✅     | ✅                      | ✅          | ✅       |
| Shift+Enter newline | ✅     | ✅                      | ✅          | ✅       |
| Cmd+Shift+Enter     | —      | ✅ (send now)           | —           | —        |
| / for commands      | —      | ✅ (slash)              | ✅          | ✅       |
| # for files/RAG     | —      | —                       | ✅          | —        |
| Escape              | —      | ✅ (close autocomplete) | ✅          | ✅       |
| Ctrl+K              | —      | —                       | ✅ (search) | —        |

**Our fork's Cmd+Shift+Enter for "send now" (interrupt) is unique and valuable.**

---

## 11. Adoption Matrix

### Must Adopt for kOS v1

| Pattern                       | Source                    | Why                                        |
| ----------------------------- | ------------------------- | ------------------------------------------ |
| Typed message parts model     | AI SDK                    | Industry standard, type-safe               |
| Tool invocation state machine | AI SDK                    | 4-state (streaming→available→output→error) |
| Collapsible tool chips        | Our fork                  | Already great, carry forward               |
| Grouped rendering             | Our fork                  | Better than any OSS                        |
| Coding panel                  | Our fork                  | Unique differentiator                      |
| Split pane layout             | Our fork                  | Unique differentiator                      |
| Image paste + compression     | Our fork                  | Mature, carry forward                      |
| Message queue                 | Our fork                  | Critical for async agent work              |
| Code block with copy button   | All (standard)            | Table stakes                               |
| Syntax highlighting           | Open WebUI / highlight.js | Add to our markdown pipeline               |
| Auto-scroll with detection    | All (standard)            | Improve current impl                       |

### Should Adopt for kOS v1.x

| Pattern                                | Source             | Why                          |
| -------------------------------------- | ------------------ | ---------------------------- |
| Lazy-loaded markdown                   | NextChat           | Performance during streaming |
| Dual renderer (simple while streaming) | NextChat           | Prevents flicker             |
| Resumable streams                      | LibreChat          | Production resilience        |
| Reasoning UI (collapsible)             | LibreChat / shadcn | CoT model support            |
| KaTeX math rendering                   | Open WebUI         | If serving technical users   |

### Consider for kOS v2+

| Pattern                     | Source                | Why                |
| --------------------------- | --------------------- | ------------------ |
| Conversation branching      | LibreChat / LobeHub   | Power user feature |
| Custom tool renderers       | LobeHub plugin system | Extensibility      |
| MCP marketplace             | LobeHub               | Plugin ecosystem   |
| Artifacts with live preview | LibreChat / NextChat  | Code generation UX |
| Voice input/output          | Open WebUI            | Multimodal         |
| Mermaid diagram rendering   | Open WebUI / NextChat | Visual content     |

### Do NOT Adopt

| Pattern                            | Source             | Why Not                                                        |
| ---------------------------------- | ------------------ | -------------------------------------------------------------- |
| Ant Design components              | LobeHub            | Heavy, not shadcn-compatible                                   |
| IndexedDB client storage           | LobeHub / NextChat | We have server state                                           |
| CSS Modules / SCSS                 | NextChat           | Prefer Tailwind                                                |
| MongoDB                            | LibreChat          | Different storage                                              |
| iframe plugin sandboxing           | LobeHub            | Over-engineered for v1                                         |
| Full recursive markdown token tree | Open WebUI         | Over-engineered; `marked.parse()` + highlight.js is sufficient |

---

## Appendix: Key File References

### Vercel AI Chatbot

- Message rendering: `components/message.tsx`
- Chat container: `components/chat.tsx`
- API route: `app/api/chat/route.ts`
- Tool components: `components/tools/`

### Vercel AI SDK

- `useChat` hook: `packages/react/src/use-chat.ts`
- UI message types: `packages/ai/src/ui/types.ts`
- Stream protocol: `packages/ai/src/ui/stream-protocol.ts`
- Tool invocation types: `packages/ai/src/tool/types.ts`

### Open WebUI

- Chat messages: `src/lib/components/chat/Messages/`
- Markdown system: `src/lib/components/chat/Messages/Markdown/`
- Message input: `src/lib/components/chat/MessageInput/`
- Store: `src/lib/stores/`

### LobeHub

- Chat store: `src/store/chat/`
- Message slice: `src/store/chat/slices/message/`
- Plugin render: `src/features/PluginRender/`
- Markdown: `src/components/Markdown/`

### NextChat

- Chat component: `app/components/chat.tsx`
- Markdown: `app/components/markdown.tsx` (lazy-loaded)
- Store: `app/store/chat.ts` (Zustand)
- Artifacts: `app/components/artifacts.tsx`

### Our Fork (OpenClaw Kinetic)

- Chat view: `ui/src/ui/views/chat.ts`
- Grouped rendering: `ui/src/ui/chat/grouped-render.ts`
- Message normalization: `ui/src/ui/chat/message-normalizer.ts`
- Tool cards: `ui/src/ui/chat/tool-cards.ts`
- Coding panel: `ui/src/ui/views/coding-panel.ts`
- Artifact panel: `ui/src/ui/views/artifact-panel.ts`
- Split panes: `ui/src/ui/views/split-pane-container.ts`
- Markdown: `ui/src/ui/markdown.ts`
