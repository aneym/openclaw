---
name: test-backend-api
description: Test OpenClaw gateway API endpoints using isolated agent servers
argument-hint: [endpoint-or-description]
allowed-tools: Bash(bash:*), Bash(curl:*), Bash(lsof:*), Bash(pnpm:*), Read, Grep, Glob
---

Test OpenClaw gateway changes by spinning up your own isolated gateway instance. Start a server, test endpoints with curl, then clean up.

## Critical Rules

1. **NEVER touch port 18789** — That's the user's personal gateway. Don't curl it, don't health-check it, don't stop it.
2. **ALWAYS run `agent:start` FIRST** — Before ANY curl commands, start your own gateway.
3. **ALWAYS stop your server when done** — Don't leave orphan processes.
4. **Use literal values, not shell variables** — Replace PORT/AGENT_ID/TOKEN with actual values in commands.
5. **Build is automatic** — `agent:start` runs `pnpm build` before starting the gateway.

## Step-by-Step Workflow

### Step 1: Start YOUR OWN Gateway (MANDATORY FIRST STEP)

```bash
cd /Users/aneyman/bot/openclaw
pnpm agent:start
```

**Parse the output carefully.** Look for these three lines:
```
AGENT_ID=abc12345
PORT=18790
TOKEN=29a827...
```

**CRITICAL:** Extract these actual values. Use them literally (not `$PORT` or `$TOKEN`) in all subsequent commands. The TOKEN is the real gateway config token (read from `~/.clawdbot/openclaw.json`).

### Step 2: Verify Gateway Is Running

Using the actual PORT from step 1:
```bash
lsof -i :18790
```

If it's not running, check the logs:
```bash
pnpm agent:logs -- abc12345
```

### Step 3: Test Endpoints

#### OpenAI-Compatible Chat API (test full agent conversations — recommended)

The chat completions endpoint runs through the full agent loop with all tools available. This is the best way to test tool changes like PDF reading, exec, browser, etc.

```bash
curl -s -X POST "http://localhost:18790/v1/chat/completions" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openclaw",
    "messages": [{"role": "user", "content": "Read /tmp/test.pdf and summarize it"}]
  }' | cat
```

#### Direct Tool Invocation (limited by tool policy)

Note: Only tools exposed via the HTTP tools policy are available here. Agent-internal tools like `read`, `write`, `edit` may not be accessible via this endpoint.

```bash
curl -s -X POST "http://localhost:18790/tools/invoke" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"tool": "memory_search", "args": {"query": "test"}}' | cat
```

#### Streaming Chat

```bash
curl -s -N -X POST "http://localhost:18790/v1/chat/completions" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openclaw",
    "stream": true,
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

### Step 4: ALWAYS Stop Your Server When Done

Using the AGENT_ID from step 1:
```bash
pnpm agent:stop -- abc12345
```

## Testing Code Changes

When you've made code changes and want to test them:

1. **Stop existing server** (if running): `pnpm agent:stop -- YOUR_ID`
2. **Start fresh** (rebuilds automatically): `pnpm agent:start`
3. **Test with curl** using the new PORT and TOKEN
4. **Stop when done**: `pnpm agent:stop -- NEW_ID`

The `agent:start` command always runs `pnpm build` first, so your latest code changes are included.

For a faster restart cycle:
```bash
pnpm agent:restart -- YOUR_AGENT_ID
```

## Commands Reference

| Command | Purpose |
|---------|---------|
| `pnpm agent:start` | **ALWAYS RUN THIS FIRST** — Build + start YOUR gateway |
| `pnpm agent:stop -- <id>` | Stop YOUR gateway when done |
| `pnpm agent:restart -- <id>` | Rebuild + restart YOUR gateway |
| `pnpm agent:status` | List all running agent gateways |
| `pnpm agent:logs -- <id>` | View YOUR gateway logs |
| `pnpm agent:kill-all` | Kill all orphan agent processes |
| `pnpm agent:cleanup` | Remove stale temp files |

## Troubleshooting

### Build fails
```bash
# Check build output
cat /tmp/openclaw-agent-YOUR_ID.log.build
```
Common causes: TypeScript errors from recent code changes.

### Gateway fails to start within 30 seconds
```bash
pnpm agent:logs -- YOUR_AGENT_ID
```
Common causes: port conflict, missing env vars, config errors.

### Orphan processes from previous runs
```bash
pnpm agent:kill-all
```

### Auth returns 401
The gateway uses the real config token from `~/.clawdbot/openclaw.json`. Use the TOKEN value from `agent:start` output, or read it from the token file: `cat /tmp/openclaw-agent-YOUR_ID-token`

## Gotchas

1. **Use literal values, not shell variables** — Replace `$PORT` with `18790`, not the variable.
2. **NEVER skip `agent:start`** — Every agent session needs its own gateway.
3. **NEVER touch port 18789** — Not even for health checks.
4. **Save your AGENT_ID and TOKEN** — You need them for all subsequent commands.
5. **Use `--` to pass arguments** through pnpm: `pnpm agent:stop -- YOUR_AGENT_ID`
6. **Clean up when done** — Always stop your server.
7. **Loopback only** — Agent gateways bind to localhost only (not LAN).
8. **Token from config** — The TOKEN is your real gateway token, not a generated test token.

## If Testing: $ARGUMENTS

Based on the user's request, identify which endpoints or tools to test and verify they work correctly. Report results with the actual curl output.
