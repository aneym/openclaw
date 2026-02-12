# SPEC: Multi-Agent Webchat — End-to-End

**Author:** Bot (for Alex)  
**Date:** 2026-02-12  
**Status:** Draft → Implementation

## Overview

Enable the OpenClaw webchat UI to fully support multiple agents: agent selection in the sidebar, per-agent thread lists, an agent dashboard, and cross-agent memory invocation from the main session.

## Current State

- **Gateway** already supports multi-agent routing (`agents.list`, `bindings`, per-agent workspaces, `resolveSessionAgentId`)
- **Webchat UI** has an "Agents" admin panel (`views/agents.ts`) for config inspection, but:
  - Thread list is flat (no per-agent grouping)
  - `chat.send` always sends to the current `sessionKey` — no agent picker for new chats
  - No visual agent switching in the sidebar
  - No agent dashboard showing active sessions per agent
- **Session keys** already encode agents: `agent:<agentId>:<rest>`
- **RPC methods** exist: `agents.list`, `agent.identity.get`, `chat.send` (accepts any `sessionKey`)

## Design

### 1. Agent Selector in Sidebar

**Location:** Top of thread-list sidebar, above the search bar.

- Dropdown/pill bar showing all configured agents (from `agents.list` RPC)
- Each agent shows: name, emoji/avatar (from identity), model badge
- Selecting an agent filters the thread list to sessions with that agent's prefix
- "All Agents" option shows everything (current behavior)
- Current agent is highlighted; badge shows unread count per agent

**Data flow:**

```
agents.list RPC → agentsList state → sidebar agent selector
                                   → filter sessions.list by agent prefix
```

### 2. New Chat Experience

**Current:** `/new` or `/reset` creates a new session under the default agent.

**New behavior:**

- "New Chat" button (+ icon) in sidebar
- If multiple agents exist, shows agent picker popover:
  - Agent name + description + model
  - Click to start new chat with that agent
- The new session key is `agent:<agentId>:<generated-id>`
- Single-agent setups skip the picker (current behavior preserved)

**Gateway change needed:** `chat.send` already accepts any `sessionKey`. The UI just needs to construct the right key with the target agent prefix.

### 3. Agent Dashboard View

**New sidebar panel:** "Agents" (or accessible via the existing agents panel).

Shows per-agent:

- **Status card:** Agent name, model, workspace path, active session count
- **Active sessions:** List of recent threads for this agent with last message preview
- **Crons:** Crons bound to this agent
- **Skills:** Skills available to this agent
- **Identity:** SOUL.md preview, avatar

This is an evolution of the existing `views/agents.ts` — currently config-focused, needs to become operational.

### 4. Thread ↔ Agent Linking

**Already exists** via session key parsing (`agent:<agentId>:<rest>`).

**UI changes:**

- Thread list items show agent badge (emoji or colored dot)
- Thread detail header shows which agent is handling it
- Threads are groupable/filterable by agent

### 5. Cross-Agent Memory Invocation

**Goal:** From main session, invoke another agent's memory/context.

**Approach — Tool-based:**
Add a system tool `agent.memory.search` that:

- Takes `agentId` + `query`
- Reads the target agent's `MEMORY.md` and/or runs memory search against their workspace
- Returns results to the calling session

**Implementation:**

- New tool in `src/agents/openclaw-tools.ts`
- Reads target agent's workspace path from config
- Performs file read (MEMORY.md, memory/\*.md) or delegates to memory search
- Gated by config: `tools.agentToAgent.memoryAccess: true`

**Alternative:** `sessions_send` already lets main agent send to another agent's session. But that's a full conversation turn, not a memory lookup. The tool approach is lighter.

### 6. Per-Agent Session Routing in Webchat

**Current:** Webchat connects to default agent. `sessionKey` is `webchat-<id>`.

**New:** Webchat sessions include agent prefix: `agent:<agentId>:webchat-<id>`.

The `resolveSessionAgentId` function already parses this. The UI just needs to construct keys correctly.

## Implementation Plan

### Phase 1: Agent Selector + Filtered Thread List (UI only)

**No gateway changes.** Pure webchat UI work.

Files to modify:

- `ui/src/ui/views/thread-list.ts` — Add agent filter bar above sessions
- `ui/src/ui/app.ts` — Add `selectedAgentFilter` state
- `ui/src/ui/app-render.ts` — Wire agent filter to thread list render
- `ui/src/ui/controllers/sessions.ts` — Filter sessions by agent prefix
- `ui/src/ui/assistant-identity.ts` — Load identities for all agents

### Phase 2: New Chat with Agent Selection

Files to modify:

- `ui/src/ui/app-chat.ts` — `handleSendChat` respects selected agent
- `ui/src/ui/views/chat-pane.ts` — New chat agent picker popover
- `ui/src/ui/session-keys.ts` — Helper to construct agent-prefixed session keys

### Phase 3: Agent Dashboard

Files to modify:

- `ui/src/ui/views/agents.ts` — Evolve from config panel to operational dashboard
- `ui/src/ui/app-render.ts` — Add agent dashboard as a first-class view
- `ui/src/ui/navigation.ts` — Route to agent dashboard

### Phase 4: Cross-Agent Memory Tool

Files to modify:

- `src/agents/openclaw-tools.ts` — New `agent.memory.search` tool
- `src/agents/agent-scope.ts` — Helper to resolve another agent's workspace

### Phase 5: Thread ↔ Agent Visual Linking

Files to modify:

- `ui/src/ui/views/thread-list.ts` — Agent badge on thread items
- `ui/src/ui/views/chat-pane.ts` — Agent indicator in chat header

## Parallelization

| Workstream               | Dependencies                           | Can Parallelize                         |
| ------------------------ | -------------------------------------- | --------------------------------------- |
| Phase 1 (Agent selector) | None                                   | ✅ Start immediately                    |
| Phase 2 (New chat)       | Phase 1 (needs agent state)            | After Phase 1                           |
| Phase 3 (Dashboard)      | None                                   | ✅ Start immediately (independent view) |
| Phase 4 (Memory tool)    | None                                   | ✅ Start immediately (backend only)     |
| Phase 5 (Visual linking) | Phase 1 (needs agent identity loading) | After Phase 1                           |

**Parallel tracks:**

- **Track A (UI):** Phase 1 → Phase 2 → Phase 5
- **Track B (Dashboard):** Phase 3
- **Track C (Backend):** Phase 4

## Testing

1. Configure 2+ agents in `openclaw.json`
2. Verify agent selector appears in sidebar
3. Create new chat targeting specific agent
4. Verify thread list filters by agent
5. Verify agent dashboard shows per-agent sessions
6. Test cross-agent memory search from main session
7. Verify single-agent setups are unchanged (no visual noise)

## Open Questions

- Should the agent picker be a dropdown, pill bar, or sidebar section?
- Should agent dashboard replace the existing agents admin panel or be separate?
- Memory search: full-text vs embeddings vs just reading MEMORY.md?
- Should webchat default to last-used agent or always show picker?
