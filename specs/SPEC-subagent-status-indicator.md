# SPEC: Sub-Agent Status Indicators in Webchat

## Problem

When a sub-agent is spawned (via `sessions_spawn`), the originating webchat thread goes silent until the sub-agent finishes and announces its result. There's no visual feedback that work is happening in the background. Users have no way to know:
- That a sub-agent is running
- What task it's working on
- How long it's been running
- Whether it errored or is still in progress

## Solution

Add real-time sub-agent status indicators to the webchat UI:
1. **Thread list sidebar** — show a spinner/icon on sessions that have active sub-agents
2. **Chat header banner** — show a compact status bar when the current session has active sub-agents
3. **Gateway API** — expose sub-agent run data to the frontend

## Architecture

### Backend: New Gateway RPC

**Method:** `subagents.list`

**Params:**
```typescript
{
  requesterSessionKey?: string;  // filter to a specific parent session
}
```

**Response:**
```typescript
{
  runs: Array<{
    runId: string;
    childSessionKey: string;
    requesterSessionKey: string;
    task: string;
    label?: string;
    createdAt: number;
    startedAt?: number;
    endedAt?: number;
    outcome?: { status: "ok" | "error"; error?: string };
  }>;
}
```

**Implementation:** Wire up `listSubagentRunsForRequester()` from `subagent-registry.ts` (already exists). If `requesterSessionKey` is omitted, return all active runs (for the sidebar indicator use case).

Also add to `server-methods-list.ts`: `"subagents.list"`.

### Backend: Gateway Events

Emit a new event when sub-agent state changes:

**Event:** `subagent` (add to `GATEWAY_EVENTS`)

**Payload:**
```typescript
{
  type: "subagent";
  data: {
    phase: "start" | "end" | "error";
    runId: string;
    requesterSessionKey: string;
    childSessionKey: string;
    task: string;
    label?: string;
    startedAt?: number;
    endedAt?: number;
    outcome?: { status: "ok" | "error"; error?: string };
  };
}
```

This lets the frontend reactively update without polling. The registry already listens to lifecycle events — extend the listener to also broadcast a gateway event.

### Frontend: State

Add to the app state:
```typescript
// Map from requester session key → active sub-agent runs
subagentRuns: Map<string, SubagentRunInfo[]>;
```

Where:
```typescript
type SubagentRunInfo = {
  runId: string;
  task: string;
  label?: string;
  startedAt?: number;
  endedAt?: number;
  outcome?: { status: "ok" | "error"; error?: string };
};
```

### Frontend: Data Flow

1. **On connect/reconnect:** Call `subagents.list` (no filter) to get all active runs
2. **On `subagent` event:** Update the local map reactively
3. **Derive `sessionsWithSubagents: Set<string>`** from the map for the sidebar

### Frontend: Thread List Indicator

In `thread-list.ts`, add a sub-agent indicator next to sessions that have active runs:

```html
<!-- After the running indicator, before the time -->
${hasActiveSubagents ? html`
  <span class="nav-thread-item__subagent" title="${subagentCount} sub-agent(s) working">
    <span class="nav-thread-item__subagent-spinner"></span>
    ${subagentCount}
  </span>
` : nothing}
```

CSS: Small animated spinner (pulsing dot or rotating icon) + count badge. Use a distinctive color (e.g., purple/blue) to differentiate from the green "running" indicator.

### Frontend: Chat Header Banner

When the current session has active sub-agents, show a banner below the chat controls:

```html
<div class="chat-subagent-banner">
  <span class="chat-subagent-banner__icon">⚡</span>
  <span class="chat-subagent-banner__text">
    ${runs.length === 1 
      ? `Sub-agent working: ${runs[0].task.slice(0, 60)}…`
      : `${runs.length} sub-agents working`}
  </span>
  <span class="chat-subagent-banner__time">${elapsed}</span>
</div>
```

The banner should:
- Be collapsible (click to expand/collapse task details)
- Show elapsed time (live-updating)
- Auto-dismiss when all sub-agents complete (with a brief "✓ Done" flash)
- Support multiple concurrent sub-agents (list them)

### Frontend: Completed State

When a sub-agent finishes:
1. Flash a brief "✓ Complete" or "✗ Failed" state for ~3 seconds
2. Then remove from the indicator
3. The announce message will appear in chat history (already works)

## Files to Modify

### Backend
- `src/agents/subagent-registry.ts` — Add gateway event emission on state changes
- `src/gateway/server-methods/subagents.ts` — New file: `subagents.list` handler
- `src/gateway/server-methods.ts` — Register new handler
- `src/gateway/server-methods-list.ts` — Add `"subagents.list"` to method list, `"subagent"` to events

### Frontend
- `ui/src/ui/types.ts` — Add `SubagentRunInfo` type
- `ui/src/ui/app.ts` — Add `subagentRuns` state
- `ui/src/ui/app-gateway.ts` — Handle `subagent` events, fetch on connect
- `ui/src/ui/views/thread-list.ts` — Add subagent indicator to `NavThreadListProps` and render
- `ui/src/ui/views/chat.ts` — Add subagent banner to `ChatProps` and render
- `ui/src/ui/app-render.ts` — Wire props through
- `ui/src/ui/chat.css` (or equivalent) — Styles for banner + spinner

## Edge Cases

- **Gateway restart:** Sub-agent registry persists to disk and restores. Frontend refetches on reconnect.
- **Multiple sub-agents:** Show count + expandable list.
- **Quick sub-agents:** If a sub-agent completes before the next poll/event, the frontend might never see it. The event-based approach handles this since start+end events fire regardless.
- **Stale runs:** Registry already has sweeper/archive. Frontend should ignore runs with `endedAt` older than 30 seconds.

## Not in Scope

- Cancelling sub-agents from the UI (future feature)
- Progress indicators within sub-agents (no mechanism exists)
- Sub-agent output streaming to parent thread (separate feature)
