# SPEC: Focused Catch-Up Queue (kOS)

## Goal

When there are many concurrent agent conversations and terminal-driven agent runs, kOS should offer a keyboard-first catch-up flow that shows one completion at a time (oldest first) so the operator can stay in flow.

This replaces the prior list-style triage inbox.

## UX Summary

- Single focused item view (one completion at a time).
- Queue ordering: strict chronological, oldest-first.
- Keyboard-first:
  - Nav mode: `j/k` navigate, `n` handled, `s` skip, `o` open, `a` toggle auto, `Enter` reply/open.
  - Input mode: `Enter` send+stay, `Cmd+Enter` send+next, `Esc` exit input mode.
- Gateway completions can be replied to directly from the catch-up view.
- Terminal completions are opened in a terminal pane for full context.

## Data Model

- Triage items are stored as events (`kos/src/renderer/src/types/triage.ts`), not a per-chat boolean.
- Existing per-chat unread (`chat.hasUnread`) remains for dots/badges, but the catch-up queue is the source of truth for focused processing.

## Sources

### Gateway Chat Completions

Gateway emits `chat` events with `state` `final/error/aborted`. Each completion enqueues a triage event.

### Terminal Agent Completions (Codex / Claude Code)

kOS starts a loopback-only HTTP endpoint and injects these env vars into terminals:

- `KOS_TRIAGE_ENDPOINT` (URL)
- `KOS_TRIAGE_TOKEN` (bearer token)
- `KOS_TERMINAL_ID` (terminal id)

Any process in the terminal can post a completion event:

```bash
curl -sS \
  -H "Authorization: Bearer $KOS_TRIAGE_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"source\":\"codex\",\"terminalId\":\"$KOS_TERMINAL_ID\",\"title\":\"Codex done\",\"preview\":\"Run finished\"}" \
  "$KOS_TRIAGE_ENDPOINT"
```

The catch-up UI will offer `o` to open the terminal by `terminalId`.

## Implementation Notes

- Bridge endpoint is loopback-only and token-gated.
- Each PTY spawned by kOS sets `KOS_TERMINAL_ID` in its environment.
- Catch-up queue state is persisted in localStorage (`kos-triage`).
