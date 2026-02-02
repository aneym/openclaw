# SPEC: Server-Side Session Auto-Title

## Overview

Move session auto-titling from the web UI (client-side) to the gateway server. Every session — webchat, Telegram, Signal, CLI — gets an auto-generated title after its first completed exchange. No client involvement required.

## Problem

The current client-side implementation in `ui/src/ui/app-gateway.ts` is unreliable:
- Only works when webchat UI is open and WebSocket-connected
- Non-webchat sessions (Telegram, Signal, CLI) never get titles
- Split-pane timing issues cause missed renames
- Browser `sessionStorage` dedup doesn't survive reloads
- Browser disconnects = missed renames entirely

## Architecture

### Hook Point

**`src/auto-reply/reply/agent-runner.ts`** — the `finally` block (~line 530) where `clearSessionRunning()` is called. This is the canonical "agent turn complete" moment that fires for ALL sessions regardless of channel.

The auto-title should fire:
1. After the **first successful agent reply** in a session (not on errors/aborts)
2. Only if the session has **no existing label** (user-set labels are never overwritten)
3. Asynchronously (fire-and-forget) — never block the reply pipeline

### Flow

```
Agent turn completes (any channel)
  → Check: session has no label AND has messages AND not already titled
  → Extract first few user + assistant messages from session transcript
  → Call Haiku (or configured title model) to generate "emoji title"
  → Write label + icon to session store via updateSessionStoreEntry
  → Broadcast sessions.updated so connected UIs refresh
```

### New Module: `src/auto-reply/reply/session-auto-title.ts`

Single-purpose module with a clean public API:

```typescript
/**
 * Attempt to auto-generate a title for a session after its first exchange.
 * Fire-and-forget — errors are logged, never thrown.
 * No-ops if the session already has a label/icon.
 */
export async function maybeAutoTitleSession(params: {
  sessionKey: string;
  storePath: string;
  sessionEntry: SessionEntry;
  sessionId: string;
  /** The session file path (for reading transcript) */
  sessionFile?: string;
  config: OpenClawConfig;
}): Promise<void>;
```

Internal helpers (not exported, or exported for testing):

```typescript
/** Extract the first N user and assistant messages from a session transcript. */
function extractTitleContext(sessionId: string, storePath: string, sessionFile?: string): { userText: string; assistantText: string } | null;

/** Call the title model (Haiku) to generate a title + icon. */
async function generateTitle(params: {
  userText: string;
  assistantText: string;
  config: OpenClawConfig;
}): Promise<{ title: string; icon: string } | null>;

/** Client-side fallback: derive title from first user message if LLM fails. */
function deriveClientSideTitle(firstUserMessage: string): string;
```

### Title Generation

Reuse the same approach from `src/gateway/title-http.ts` but as a direct function call (no HTTP round-trip):

1. Use `runAgent()` from `src/agents/runtime-dispatcher.ts`
2. Model: `claude-haiku-4-5` (configurable via `agents.defaults.titleModel` — optional, not required for MVP)
3. Prompt: Same as title-http.ts — "Generate a short title (3-6 words) and a single topic emoji"
4. Temp session file created and cleaned up
5. Parse "emoji title" format from response
6. Fallback: if LLM fails, derive title from first user message (first sentence, max 40 chars) using the existing `deriveSessionTitle` heuristic in `src/gateway/session-utils.ts`

### Session Store Update

After title generation:
1. Call `updateSessionStoreEntry()` to set `label` + `icon`
2. Only write if session STILL has no label (race-condition guard — user may have manually renamed during generation)
3. Broadcast a WebSocket event so connected UIs update their sidebar. Use the existing pattern — look at how `sessions.patch` broadcasts updates. The gateway `server-methods/sessions.ts` calls `broadcast("sessions.updated", ...)` after patches.

### Integration in agent-runner.ts

In the `finally` block, after `clearSessionRunning(sessionKey)`:

```typescript
// Fire-and-forget auto-title (never blocks reply)
if (sessionKey && storePath && activeSessionEntry) {
  void maybeAutoTitleSession({
    sessionKey,
    storePath,
    sessionEntry: activeSessionEntry,
    sessionId: followupRun.run.sessionId,
    sessionFile: activeSessionEntry.sessionFile,
    config: cfg,
  }).catch(() => {}); // swallow errors
}
```

### Skip Conditions (important!)

Do NOT auto-title if:
- Session already has a `label` set (user-renamed)
- Session already has an `icon` set (implies it was titled)
- Session is a heartbeat run (`isHeartbeat` flag)
- Session is a cron/subagent run (key starts with `subagent:` or contains `cron`)
- Session is a temp/title-gen session (key starts with `temp:`)
- The agent run errored or was aborted (only title on successful completions)
- There are no user messages in the transcript yet

### Removing Client-Side Auto-Rename

After the server-side implementation is working and tested:
1. **Remove** `maybeAutoRenameSession()` and all its call sites from `ui/src/ui/app-gateway.ts`
2. **Remove** `batchRenameUnnamedSessions()` if it exists
3. **Remove** the `isRenamed()` / `markRenamed()` sessionStorage helpers
4. **Keep** the `POST /api/utils/generate-title` endpoint for now (the TUI uses it, and it's a useful API) — but mark it as deprecated with a comment
5. The UI should reactively update titles when it receives `sessions.updated` WebSocket events (it likely already does this)

## Broadcasting

When the server writes a new title, connected UIs need to know. Check how `sessions.patch` in `src/gateway/server-methods/sessions.ts` broadcasts updates. The auto-title module needs access to the broadcast function.

Options (in order of preference):
1. **Agent event bus** — emit a lightweight event that the gateway server-chat handler picks up and broadcasts
2. **Direct broadcast** — pass the broadcast function into the auto-title module (dependency injection)
3. **Session store watcher** — UI polls/watches for store changes (already happens on intervals)

Option 3 is simplest and may already work — the UI refreshes sessions periodically. But for instant updates, option 1 or 2 is better.

**Recommended: Use the agent event bus.** Emit a custom event like:
```typescript
emitAgentEvent({
  runId,
  seq: nextSeq(),
  stream: "lifecycle",
  data: { phase: "session-titled", sessionKey, title, icon },
});
```

The gateway server-chat handler can listen for this and broadcast a `sessions.updated` event. OR, simpler: just trigger a `sessions.list` refresh on connected clients by broadcasting a generic notification.

Actually, simplest approach: after writing to the session store, call the same broadcast pattern that `sessions.patch` uses. Look at `src/gateway/server-methods/sessions.ts` to see exactly how it broadcasts after a patch. The auto-title function will need a reference to the broadcast function — pass it in as a parameter.

## Testing

### Unit Tests: `src/auto-reply/reply/session-auto-title.test.ts`

Write comprehensive tests:

1. **Skip conditions:**
   - Skips when session already has a label
   - Skips when session already has an icon
   - Skips for heartbeat sessions
   - Skips for subagent sessions (key starts with `subagent:`)
   - Skips for temp sessions (key starts with `temp:`)
   - Skips when no user messages exist in transcript

2. **Title generation:**
   - Extracts user and assistant text from transcript correctly
   - Truncates long messages appropriately
   - Parses "emoji title" format correctly (emoji + space + title)
   - Handles response with no emoji (just title)
   - Handles empty/invalid LLM response gracefully
   - Falls back to client-side heuristic when LLM fails
   - Client-side heuristic: first sentence, max 40 chars, no trailing punctuation weirdness

3. **Session store update:**
   - Writes label + icon to session store on success
   - Does NOT overwrite if label was set between generation start and write (race condition)
   - Handles concurrent title generation for same session (idempotent)

4. **Error handling:**
   - LLM timeout (15s) doesn't block the reply pipeline
   - LLM error falls back to heuristic title
   - Session store write failure is logged but doesn't throw
   - Temp session file is always cleaned up (even on error)

5. **Integration-level:**
   - Full flow: agent run completes → title generated → session store updated
   - Verify title appears in `sessions.list` response after generation
   - Verify it works for webchat, Telegram-origin, and Signal-origin sessions
   - Verify heartbeat runs don't trigger titling
   - Verify user-renamed sessions are never overwritten

### Test Utilities

- Mock `runAgent()` to return controlled responses (don't actually call Haiku in tests)
- Use temp directories for session stores
- Use the existing test patterns in the codebase (check `src/auto-reply/reply/*.test.ts` for conventions)

## Files to Modify

### New files:
- `src/auto-reply/reply/session-auto-title.ts` — core module
- `src/auto-reply/reply/session-auto-title.test.ts` — tests

### Modified files:
- `src/auto-reply/reply/agent-runner.ts` — add fire-and-forget call in `finally` block
- `ui/src/ui/app-gateway.ts` — remove client-side auto-rename logic

### Possibly modified:
- `src/gateway/server-chat.ts` — if we need to broadcast session updates from the event bus
- `src/gateway/title-http.ts` — mark as deprecated, refactor to use shared title generation logic

## Non-Goals

- Configurable title model (use hardcoded Haiku for now)
- Batch rename of existing unnamed sessions (can be a follow-up)
- Title regeneration / re-titling command
- Custom title prompts per agent

## Implementation Notes

- Check how `src/auto-reply/reply/session-usage.ts` does its fire-and-forget `persistSessionUsageUpdate()` — it's the same pattern we want (async, non-blocking, error-swallowed)
- The `runAgent()` call in `runtime-dispatcher.ts` handles temp session creation — reuse this pattern from `title-http.ts`
- `resolveDefaultAgentId()` and `resolveAgentWorkspaceDir()` are needed to set up the agent run context
- The session transcript is read via `readFirstUserMessageFromTranscript()` in `session-utils.ts` — we may need a more flexible version that reads multiple messages

## Sequence Diagram

```
User sends message (any channel: webchat, Telegram, Signal, CLI)
  │
  ▼
agent-runner.ts: runReplyAgent()
  │
  ├─ Agent processes message, generates reply
  │
  ├─ Reply sent back to user via channel
  │
  └─ finally block:
      ├─ clearSessionRunning(sessionKey)
      │
      └─ void maybeAutoTitleSession({ ... }).catch(() => {})
          │
          ├─ Check: session has label? → SKIP
          ├─ Check: is heartbeat/subagent/temp? → SKIP
          │
          ├─ Read transcript: extract first user + assistant messages
          │
          ├─ Call runAgent() with Haiku + title prompt
          │   ├─ Success → parse "emoji title"
          │   └─ Failure → deriveClientSideTitle(firstUserMessage)
          │
          ├─ Re-check: session STILL has no label? (race guard)
          │
          ├─ updateSessionStoreEntry({ label, icon })
          │
          └─ Broadcast sessions.updated to connected UIs
```
