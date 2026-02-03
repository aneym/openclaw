# Agent Orchestration Notes

Date: 2026-02-03

## Standard Loop (v0)

- If a decision is unclear, post the question on the Linear issue.
- Pause work until a response is posted in Linear.
- Return to the Codex thread and write "Responded" before continuing.
- On completion, update Linear with:
  - Status change (In Progress -> Done)
  - Summary
  - Files touched
  - Tests run (or "not run")
  - Open questions / blockers

## Current Decisions (from Linear Q&A)

- `Thread.tabId` should be required; legacy threads without it should be assigned to Home on hydration (`home-<workspaceId>`).
- Home tab id should be deterministic: `home-<workspaceId>`.
- Project tab title/icon should be populated from Project data when available; fallback to a safe placeholder if missing.
- Thread ownership is `thread.tabId` (source of truth). `activeThreadIdByTab` is selection state only.
- Clicking a project keeps the current active thread if present; show Linear board only when the project tab has no active thread.

## Data Sources (Home Dashboard)

- Running CC/Codex sessions: `GET /api/coding-sessions`
- Stop CC/Codex: `POST /api/coding-sessions/:id/kill`
- Stop active chat run: gateway RPC `chat.abort`
- Sims/webviews: infer from open panel layouts until telemetry exists.

## Orchestrator Decisions (2026-02-03)

- Home tab is the only general/routing entry (no separate General project tab).
- Routed threads move out of Home; Home may show a lightweight activity log, not the full thread.
- Auto-focus the project tab when routing picks a project.
- Tabs are reorderable and order persists across restarts.
- Home is the only non-closable tab; all project tabs can be closed.
- `Thread.tabId` is required; migrate legacy threads to Home on hydration.
- Dashboard controls: stop/kill + jump only (no terminal attach in dashboard for v1).
- Dashboard shows global running sessions; per-tab counts live on the tab strip.
- Shortcut swap: `Cmd+W` closes panel; `Cmd+Shift+W` closes tab.
