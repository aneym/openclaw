# SPEC: Dev watch supervisor loop

## Problem

The dev workflow needs: make code change → tsgo compiles → gateway loads new code → session resumes.

Current state:
- tsgo `--watch` now correctly emits to `dist/` (fixed: `--noEmit false`)
- But the gateway process never reloads the new code
- SIGUSR1 does in-process restart (same process, same loaded JS modules — stale code)
- `node --watch` was removed because it auto-restarted on every file change, crashing mid-conversation

## Solution

Make `watch-node.mjs` a **supervisor** that restarts the gateway process on demand:

### 1. `scripts/watch-node.mjs` — supervisor loop

Replace the current "exit when gateway exits" behavior with a restart loop:

```js
let nodeProcess = null;
let exiting = false;

function startGateway() {
  nodeProcess = spawn(process.execPath, ["openclaw.mjs", ...args], {
    cwd,
    env,
    stdio: "inherit",
  });

  nodeProcess.on("exit", (code, signal) => {
    if (exiting) return;
    
    // Exit code 0 or SIGUSR2 = intentional restart request, respawn
    if (code === 0 || signal === "SIGUSR2") {
      console.error("[watch] gateway exited, restarting...");
      setTimeout(() => startGateway(), 500);  // brief delay for port release
      return;
    }
    
    // Non-zero exit = real crash, propagate
    cleanup(code ?? 1);
  });
}

startGateway();
```

Key behaviors:
- Gateway exits with code 0 → supervisor restarts it (loads fresh dist/)
- Gateway crashes (non-zero) → supervisor propagates the exit (don't loop on crashes)
- Ctrl+C / SIGTERM → clean shutdown of everything

### 2. Gateway SIGUSR1 behavior in dev mode

When `OPENCLAW_GATEWAY_DEV=1` (set by dev-all.sh), make the SIGUSR1 handler in `run-loop.ts` exit the process cleanly instead of doing in-process restart. The supervisor will respawn it.

Check `src/cli/gateway-cli/run-loop.ts` — the `onSigusr1` handler currently calls `request("restart", "SIGUSR1")` which does in-process restart. In dev mode, it should instead do `process.exit(0)` (after writing the running-sessions state).

OR: simpler approach — just have the gateway tool action send SIGTERM to the gateway process when in dev mode, instead of scheduling SIGUSR1. The supervisor loop catches the exit and restarts.

Actually simplest: the `run-loop.ts` restart path already calls `server.close()` then loops back to `server = await params.start()`. Instead of looping, if we detect dev mode, we `process.exit(0)` after `server.close()`, letting the supervisor handle it.

### 3. Session resume flow

This should work automatically:
1. Session is mid-turn → `running-sessions.json` has the session entry with old PID
2. Gateway process exits → old PID is now dead
3. Supervisor starts new process → `consumeInterruptedSessions()` finds dead PID entries
4. `wakeInterruptedSessions()` injects system event + triggers heartbeat
5. Session resumes

### 4. The restart sentinel

The gateway tool (`action: restart`) already writes a restart sentinel before triggering SIGUSR1. This sentinel contains the sessionKey and delivery context. On startup, the sentinel is consumed and used to route the "restart complete" message back to the right session.

For the dev flow, this means:
- Agent calls `gateway(action: restart)` 
- Sentinel is written
- Gateway exits (dev mode)
- Supervisor restarts gateway
- New process finds sentinel → notifies session
- New process finds running-sessions.json → resumes interrupted sessions

### Files to modify

1. `scripts/watch-node.mjs` — supervisor restart loop
2. `src/cli/gateway-cli/run-loop.ts` — dev mode: exit instead of in-process restart on SIGUSR1

### Important constraints

- Only change dev behavior (check `OPENCLAW_GATEWAY_DEV` env var)
- Production SIGUSR1 (launchd daemon) must keep working as-is
- Don't auto-restart on tsgo file changes — only restart on explicit command (gateway tool)
- Handle the `--force` flag on restart (port may still be held briefly)
- The supervisor should handle SIGINT/SIGTERM cleanly (forward to gateway, then exit)
