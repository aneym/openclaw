#!/usr/bin/env bash
# Start gateway + Vite UI for local development.
# Uses the main state directory (~/.openclaw/) so dev and prod share memory/sessions.

set -euo pipefail

CONFIG="${HOME}/.openclaw/openclaw.json"

# Read token from config for the dev UI URL
TOKEN=""
if [ -f "$CONFIG" ]; then
  TOKEN=$(node -e "
    const c = JSON.parse(require('fs').readFileSync('$CONFIG','utf8'));
    process.stdout.write(c.gateway?.auth?.token ?? '');
  " 2>/dev/null || true)
fi

# Kill stale Vite dev server if port 3636 is still held
lsof -ti :3636 | xargs kill -9 2>/dev/null || true

pnpm gateway:watch &
pnpm ui:dev &

sleep 4
if [ -n "$TOKEN" ]; then
  printf '\n  Dev UI: http://localhost:3636/?token=%s\n\n' "$TOKEN"
else
  printf '\n  Dev UI: http://localhost:3636/\n  (no token configured in %s)\n\n' "$CONFIG"
fi

wait
