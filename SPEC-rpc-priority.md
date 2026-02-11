# SPEC: Gateway RPC Priority & Memory Limits

## Problem

When 4+ concurrent agent turns are running (streaming LLM responses + executing tools), the Node.js event loop becomes saturated. WebSocket RPC calls (like `cron.list`, `cron.run`, `sessions.list`) time out at 60s because agent turn processing monopolizes the event loop.

The machine has 60GB RAM but the Node process has no explicit `--max-old-space-size`, defaulting to ~4GB. The CPU saturation is the primary issue — RPC handlers never get a chance to run.

## Requirements

### 1. Increase Node.js memory limit

In `scripts/watch-node.mjs` and `scripts/run-node.mjs`, add `--max-old-space-size=16384` (16GB) to the Node spawn args. The machine has 60GB — give it room.

Find where `process.execPath` is spawned with args and add the flag:

- `watch-node.mjs`: look for `spawn(process.execPath, ["--watch", "openclaw.mjs", ...args]` — add `"--max-old-space-size=16384"` before `"openclaw.mjs"`
- `run-node.mjs`: same pattern, find the node spawn and add the flag

Also add it to `openclaw.mjs` if that's the entry point that spawns the actual gateway process.

### 2. Concurrent agent turn limit

Add a configurable limit on how many agent turns can run simultaneously. Default to 6. When the limit is hit, new agent turns (from crons, subagents, etc.) should queue and wait rather than all running at once. This prevents event loop saturation.

Look at how agent turns are dispatched — likely in the session runner or cron executor. Add a semaphore/counter that gates concurrent LLM API calls.

### 3. RPC handler yield points (if feasible)

If there are hot loops in the agent turn execution path (streaming response processing, tool result handling), add `setImmediate()` yield points so the event loop can process pending WebSocket messages between chunks.

## Non-Goals

- Don't change the RPC timeout value (that's client-side)
- Don't add worker threads (too complex for this change)
- Don't change the cron scheduling logic

## Files to Check

- `scripts/watch-node.mjs` — dev mode launcher
- `scripts/run-node.mjs` — prod mode launcher
- `openclaw.mjs` — entry point
- `src/gateway/server.ts` or similar — WebSocket server
- `src/agents/` — agent turn execution
- `src/cron/` — cron job executor
- `src/agents/tools/` — tool execution (where event loop gets blocked)

## Testing

After changes:

1. Start gateway with `pnpm dev:all`
2. Trigger 4+ concurrent cron jobs
3. Run `cron.list` via RPC — should respond within a few seconds, not timeout
