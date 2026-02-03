# SPEC: Interrupted Session Recovery

## Problem

When the gateway restarts, any sessions that were mid-turn (agent was actively running — processing tool calls, generating responses, etc.) are silently abandoned. The agent never gets to finish its work, the user sees no notification, and the session is left in a limbo state.

The existing restart sentinel mechanism only notifies the **single session that triggered the restart**. It doesn't detect or recover sessions that were interrupted by the restart.

Subagent sessions already have recovery via `subagent-registry.ts` (persisted to disk, restored + resumed on startup). We need the same for regular sessions.

## Design

### Overview

1. **Track running sessions** — When a session starts an agent turn, mark it as "running" in a lightweight on-disk state file. When the turn completes (success or error), clear the mark.
2. **On startup, detect interrupted sessions** — Read the state file, find sessions still marked "running" (which means the gateway died mid-turn), and inject system events to notify those sessions.
3. **Works with all session types** — Main sessions, channel sessions (Telegram, Discord, etc.), webchat split-pane sessions, subagent sessions — all covered.

### State File

New file: `~/.openclaw/state/running-sessions.json`

```json
{
  "version": 1,
  "sessions": {
    "<sessionKey>": {
      "sessionId": "uuid",
      "runId": "uuid",
      "startedAt": 1706745600000,
      "pid": 12345
    }
  }
}
```

- Written atomically (tmp + rename) like session store
- Cleaned up on normal turn completion
- On startup: any entries still present = interrupted sessions

### Key Implementation Points

#### 1. New module: `src/infra/running-sessions.ts`

Core state management:

```typescript
// Mark a session as having an active run
export function markSessionRunning(params: {
  sessionKey: string;
  sessionId: string;
  runId: string;
}): void;

// Clear the running mark after turn completes
export function clearSessionRunning(sessionKey: string): void;

// On startup: read file, return all sessions that were running when we died
export function consumeInterruptedSessions(): InterruptedSession[];

// Get current running sessions (for diagnostics)
export function getRunningSessionKeys(): string[];
```

State file location: resolved via `resolveStateDir()` (same as restart sentinel).

The file is written synchronously to avoid races. Reads are async (startup only).

#### 2. Hook into agent turn lifecycle

In `src/auto-reply/reply/agent-runner.ts` — `runReplyAgent()`:

- **Before the run**: call `markSessionRunning({ sessionKey, sessionId, runId })`
- **After the run (finally block)**: call `clearSessionRunning(sessionKey)`

In `src/commands/agent.ts` — `agentCommand()`:

- Same pattern: mark before run, clear in finally

In `src/agents/pi-embedded-runner.ts` or equivalent entry points for CLI backends:

- Same pattern

The key insight: we must mark BEFORE the agent starts and clear AFTER it finishes, in a finally block so crashes/errors still clean up.

#### 3. On startup: inject system events for interrupted sessions

In `src/gateway/server-startup.ts` — `startGatewaySidecars()`:

- After the restart sentinel wake (which handles the single triggering session), call a new function `wakeInterruptedSessions()`
- This reads the interrupted sessions state, and for each one:
  - Injects a system event via `enqueueSystemEvent()` with a message like: `"⚠️ Your previous turn was interrupted by a gateway restart. The response was not completed. Review context and continue if needed."`
  - Then triggers a heartbeat wake so the sessions actually process the event
- Skip sessions that the restart sentinel already handled (to avoid duplicates)
- Skip subagent sessions (they have their own recovery via subagent-registry)

#### 4. Integration with gateway close

In `src/gateway/server-close.ts`:

- Before closing, snapshot the current running sessions to the state file (they're about to be interrupted)
- This handles graceful restarts (SIGUSR1, config apply, update)

For ungraceful crashes (SIGKILL, OOM, power loss):

- The state file already has the entries because we write them at run start
- On next startup, we'll find them and notify

### File Changes

1. **NEW `src/infra/running-sessions.ts`** — Core module: mark/clear/consume running sessions state
2. **NEW `src/infra/running-sessions.test.ts`** — Unit tests for the core module
3. **EDIT `src/auto-reply/reply/agent-runner.ts`** — Add mark/clear calls around `runAgentTurnWithFallback`
4. **EDIT `src/commands/agent.ts`** — Add mark/clear calls around agent command execution
5. **NEW `src/gateway/server-interrupted-sessions.ts`** — Startup handler: consume interrupted sessions, inject system events
6. **NEW `src/gateway/server-interrupted-sessions.test.ts`** — Tests for startup recovery flow
7. **EDIT `src/gateway/server-startup.ts`** — Call `wakeInterruptedSessions()` after sentinel wake
8. **EDIT `src/gateway/server-close.ts`** — No changes needed (state file is already written at mark time)

### Edge Cases

- **Multiple panes / concurrent sessions**: Each session key is independent. Multiple sessions can be marked running simultaneously. Each gets its own recovery notification.
- **Subagent sessions**: Skip them in `wakeInterruptedSessions()` — they have their own recovery via `subagent-registry.ts`. Detect by checking if sessionKey starts with `cron:` or has a subagent run registered.
- **Heartbeat sessions**: Mark/clear like any other session. If a heartbeat was interrupted, it'll just run again naturally.
- **Stale entries**: If the PID in the state file doesn't match the current process AND the process is dead, the entries are definitely interrupted. If somehow an entry is stale (old crash, never cleaned up), the worst case is a benign "your turn was interrupted" message.
- **Rapid restarts**: The consume function clears the file after reading, so double-processing is avoided.
- **Memory flush turns**: These are silent turns that use NO_REPLY. They should also be tracked — if a memory flush was interrupted, the agent should know.
- **CLI backend sessions**: Track them too if they go through `agentCommand()`.

### What NOT to do

- Don't try to "resume" the actual model turn — that's impossible. Just notify.
- Don't auto-retry the user's message — the agent will see the notification and can decide what to do.
- Don't persist delivery context in the running sessions file — use the session store for that (it's already there).

### Testing Strategy

1. **Unit tests for `running-sessions.ts`**:
   - markSessionRunning writes to file
   - clearSessionRunning removes entry from file
   - consumeInterruptedSessions returns entries and clears file
   - Multiple concurrent sessions tracked correctly
   - Corrupted file handled gracefully
   - Missing file returns empty array

2. **Unit tests for `server-interrupted-sessions.ts`**:
   - Interrupted sessions get system events enqueued
   - Restart sentinel session is skipped (no duplicate notification)
   - Subagent sessions are skipped
   - Empty interrupted list = no-op
   - Heartbeat wake is triggered when there are interrupted sessions

3. **Integration consideration**: The mark/clear in agent-runner.ts should be tested via the existing agent-runner test infrastructure if available, or verified manually.

## Implementation Notes

- Use `resolveStateDir()` from `src/config/paths.ts` for the state file location
- Write synchronously (fs.writeFileSync) for mark/clear to avoid async races during shutdown
- Read can be async (only happens at startup)
- The state file is small (just session keys + metadata), so sync I/O is fine
- Use atomic writes (tmp + rename) like the session store for crash safety
- Include the PID so we can distinguish "our process is still running" from "previous process crashed"
