# Session Key Architecture

> How kOS and the OpenClaw gateway identify, route, and store chat sessions.

## Overview

A **session key** is a hierarchical string that uniquely identifies a conversation. It's the primary routing and storage mechanism — every chat event, message send, history load, and session list entry uses session keys to connect UI state to the correct backend session.

## Canonical Format

```
agent:{agentId}:{rest}
```

| Segment     | Description                                   | Example                       |
| ----------- | --------------------------------------------- | ----------------------------- |
| `agent:`    | Literal prefix (always lowercase)             | `agent:`                      |
| `{agentId}` | Normalized agent ID (lowercase, alphanumeric) | `main`, `dev`                 |
| `{rest}`    | Session identifier within the agent's scope   | `main`, `telegram:dm:user123` |

### Examples

```
agent:main:main                          # Default main session
agent:main:telegram:dm:user123           # Telegram DM
agent:main:telegram:group:groupid123     # Telegram group
agent:main:slack:g-C04XXXXX             # Slack channel
agent:dev:main                           # Dev agent's main session
agent:main:subagent:abc123               # Subagent session
```

### Reserved Keys

`global` and `unknown` are special system-level keys returned **without** the `agent:` prefix.

### Legacy (Bare) Format

Before canonicalization, keys were stored without the `agent:` prefix:

```
main                    # → agent:main:main
telegram:dm:user123     # → agent:main:telegram:dm:user123
```

The gateway still accepts bare keys and resolves them by prepending the default agent ID.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│  kOS (Electron Renderer)                                    │
│                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌───────────────┐ │
│  │  chat-store   │    │ session-sync │    │ chat-session   │ │
│  │  (persisted)  │◄───│   hook       │    │   store       │ │
│  │               │    │              │    │  (per-chat)   │ │
│  │  Chat {       │    │ sessions.list│    │               │ │
│  │   id          │    │ chat events  │    │ handleChat    │ │
│  │   sessionKey ─┼────┼──────────────┼────┤ Event()      │ │
│  │   title       │    │              │    │ loadHistory() │ │
│  │   ...         │    │              │    │ sendMessage() │ │
│  │  }            │    │              │    │               │ │
│  └──────────────┘    └──────┬───────┘    └───────┬───────┘ │
│                             │                     │         │
│  ┌──────────────────────────┴─────────────────────┴───────┐ │
│  │  session-keys.ts                                        │ │
│  │  parseAgentSessionKey() · normalizeSessionKey()         │ │
│  │  sessionKeysMatch()                                     │ │
│  └─────────────────────────┬──────────────────────────────┘ │
│                             │                               │
│  ┌──────────────────────────┴─────────────────────────────┐ │
│  │  gateway-store (WebSocket)                              │ │
│  │  connect() → hello → subscribe(chat/agent events)       │ │
│  └─────────────────────────┬──────────────────────────────┘ │
└─────────────────────────────┼───────────────────────────────┘
                              │ WebSocket (protocol v3)
┌─────────────────────────────┼───────────────────────────────┐
│  OpenClaw Gateway           │                               │
│                             │                               │
│  ┌──────────────────────────┴─────────────────────────────┐ │
│  │  session-utils.ts                                       │ │
│  │  resolveSessionStoreKey()                               │ │
│  │  resolveGatewaySessionStoreTarget()                     │ │
│  │  loadSessionEntry() — canonical key first, legacy       │ │
│  │                        fallback if not found             │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌───────────────┐ │
│  │  routing/     │    │  sessions/   │    │  gateway/     │ │
│  │  session-key  │    │  session-key │    │  protocol/    │ │
│  │  .ts          │    │  -utils.ts   │    │  sessions.ts  │ │
│  │              │    │              │    │               │ │
│  │ buildAgent   │    │ parseAgent   │    │ sessions.list │ │
│  │ SessionKey() │    │ SessionKey() │    │ chat.send     │ │
│  │ resolveMain  │    │ isSubagent() │    │ chat.history  │ │
│  │ SessionKey() │    │ isAcp()      │    │ chat.abort    │ │
│  └──────────────┘    └──────────────┘    └───────────────┘ │
│                                                             │
│  Storage: ~/.openclaw/agents/{agentId}/sessions/store.jsonl │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow

### 1. Connection & Session Load

```
App mount
  → useEffect: connect(gatewayUrl, token)
    → GatewayClient.start()
      → WebSocket open
        → sendConnect({ client: "kos", mode: "webchat", role: "operator" })
          → gateway returns hello-ok { server, features, auth, snapshot }
            → onHello: set connected=true
              → useSessionSync: sessions.list({ limit: 50, activeMinutes: 10080 })
                → gateway returns { sessions: GatewaySessionRow[], defaults }
                  → for each session:
                      resolveSessionKey(entry) → canonical key
                      findChatBySessionKey(chats, key) via sessionKeysMatch()
                      → existing? update title/status/lastMessageAt
                      → new? create Chat { id, sessionKey, title, status }
```

### 2. New Chat (User-Initiated)

```
User clicks "New Chat"
  → create Chat { id: generateChatId(), sessionKey: "agent:main:main" }
  → getChatSessionStore(sessionKey, chatId)
    → creates per-session Zustand store
  → user types message → sendMessage(text)
    → chat.send({ sessionKey, message, deliver: false })
      → gateway creates/reuses session, starts agent run
        → chat event { state: "delta", sessionKey: "agent:main:main", runId }
          → handleChatEvent routes via sessionKeysMatch()
          → streamText accumulates
        → chat event { state: "final", message }
          → atomic clear: runId=null, streamText="", activeTools=[]
          → insert final message, reload history, flush queue
```

### 3. Event Routing

Every incoming `chat` and `agent` event carries a `sessionKey`. The chat session store routes events like this:

```typescript
// chat-session-store.ts
handleChatEvent(payload) {
  // Route only to matching session (canonical ↔ bare comparison)
  if (!sessionKeysMatch(payload.sessionKey, state.sessionKey)) return

  // Handle delta/final/aborted/error...
}
```

`sessionKeysMatch()` ensures routing works regardless of whether the gateway sends canonical or bare keys:

```typescript
sessionKeysMatch("agent:main:telegram:dm:123", "telegram:dm:123") === true;
sessionKeysMatch("agent:main:main", "main") === true;
sessionKeysMatch("agent:dev:main", "agent:main:main") === false; // different agents
```

## Key Design Decisions

### Store Keying: chatId, Not sessionKey

Chat session stores are keyed by `chatId` (a locally generated stable ID), not `sessionKey`:

```typescript
// chat-session-store.ts
const stores = new Map<string, StoreApi<ChatSessionState>>();

function getChatSessionStore(sessionKey: string, chatId: string) {
  const key = chatId; // ← stable local ID, not sessionKey
  if (!stores.has(key)) {
    stores.set(key, createChatSessionStore(sessionKey, chatId));
  }
  return stores.get(key)!;
}
```

**Why:** The sessionKey can change during a session's lifetime — when the gateway returns the canonical form, the store updates `sessionKey` in-place without needing to re-key the store. This prevents losing state during the bare→canonical transition.

### Two-Level Chat Model

| Layer             | Store                   | Keyed By | Persisted                  | Contains                                                            |
| ----------------- | ----------------------- | -------- | -------------------------- | ------------------------------------------------------------------- |
| **Chat metadata** | `useChatStore`          | `chatId` | localStorage (`kos-chats`) | title, sessionKey, status, timestamps, workspace/project assignment |
| **Chat session**  | `getChatSessionStore()` | `chatId` | Not persisted              | messages, streaming state, queue, active tools                      |

The chat metadata store survives page reloads. The session store is ephemeral — messages reload from the gateway on reconnect via `chat.history`.

### Session Sync Strategy

On connect, kOS loads the 50 most recent sessions (7-day window). This is a **tiered load**:

1. **Initial**: `sessions.list({ limit: 50, activeMinutes: 10080 })` — fast, covers recent activity
2. **On demand**: `loadMoreChats()` → `sessions.list({ limit: 500 })` — full list, archives anything not present

Session sync uses `sessionKeysMatch()` to find existing chats, because the local store may have bare keys while the gateway returns canonical keys.

## Gateway Session Resolution

When the gateway receives a session key (from `chat.send`, `chat.history`, etc.), it resolves it through `resolveSessionStoreKey()`:

```
Input: "main" (bare)
  ↓
1. Trim, check special keys (global, unknown)
2. parseAgentSessionKey() → null (not canonical)
3. Check if equals config mainKey or "main"
4. Yes → resolveMainSessionKey() → "agent:main:main"
  ↓
Output: "agent:main:main" (canonical)
```

```
Input: "agent:main:telegram:dm:user123" (already canonical)
  ↓
1. Trim, check special keys → no
2. parseAgentSessionKey() → { agentId: "main", rest: "telegram:dm:user123" }
3. Already canonical, check for main alias → not applicable
  ↓
Output: "agent:main:telegram:dm:user123" (unchanged)
```

### Session Store on Disk

Sessions are stored per-agent at:

```
~/.openclaw/agents/{agentId}/sessions/store.jsonl
```

Each line is a JSON session entry keyed by the canonical session key. The gateway's `loadSessionEntry()` tries the canonical key first, then falls back to the legacy bare key for backward compatibility.

## Gateway Protocol: sessions.list Response

```typescript
{
  ts: number; // Server timestamp
  path: string; // Store file path
  count: number; // Sessions returned
  defaults: {
    // Model defaults for new sessions
    modelProvider: string | null; // e.g. "anthropic"
    model: string | null; // e.g. "claude-opus-4-6"
    contextTokens: number | null; // e.g. 200000
  }
  sessions: Array<{
    key: string; // Canonical session key
    kind: "direct" | "group" | "global" | "unknown";
    sessionId?: string; // UUID for transcript file
    label?: string; // User-set title (highest priority)
    displayName?: string; // Auto-generated name
    derivedTitle?: string; // From first user message
    lastMessagePreview?: string; // Last message text
    channel?: string; // "telegram", "slack", etc.
    updatedAt: number | null; // Last activity timestamp
    archivedAt?: number; // Archive timestamp
    // ... model overrides, token usage, delivery context
  }>;
}
```

kOS maps this to `Chat` objects:

- `key` → `sessionKey`
- `label ?? derivedTitle ?? displayName` → `title`
- `updatedAt` → `lastMessageAt`
- `channel` → `channel`
- `archivedAt` → `status: "archived"`

## Current State & Remaining Work

### What's Done (kOS-side)

- `session-keys.ts` — parsing, normalization, and flexible matching via `sessionKeysMatch()`
- `chat-session-store.ts` — per-session stores keyed by stable chatId, sessionKey can change
- `use-session-sync.ts` — tiered session loading, event-driven status updates, delayed title refresh
- `chat-store.ts` — persisted chat metadata with Map serialization, merge with `sessionKeysMatch()`

### What's Remaining (Gateway-side)

These changes are in the parent openclaw repo (`../src/`), not in kOS:

1. **Canonicalize at entrypoints** — Ensure `chat.send`, `chat.history`, `agent.*`, and all event emissions use canonical keys consistently. Currently some code paths may emit bare keys.

2. **Startup migration** — At gateway boot, scan `store.jsonl` and rewrite any legacy bare keys to canonical form. This is a one-time migration per install.

3. **Remove legacy fallback in `loadSessionEntry()`** — After migration, the fallback from canonical→bare lookup is unnecessary. Remove it to simplify the code path.

### What's Remaining (kOS-side, after gateway changes)

Once the gateway always returns canonical keys:

1. **Simplify `sessionKeysMatch()`** — Can be replaced with direct string comparison (`===`) since both sides will always be canonical.

2. **Remove `normalizeSessionKey()`** — No longer needed to strip the `agent:` prefix for comparison.

3. **Simplify `findChatBySessionKey()`** — Currently does O(n) scan with `sessionKeysMatch()`. With canonical keys, can use a `Map<sessionKey, chatId>` index for O(1) lookup.

4. **Build canonical keys for new chats** — When user creates a new chat, use the `defaults` from `sessions.list` (or hello response) to build the canonical key `agent:{defaultAgentId}:main` instead of using a bare key.

These kOS simplifications are **not blocking** — the current code handles both formats correctly via `sessionKeysMatch()`. They're cleanup to remove complexity once the gateway guarantees canonical output.
