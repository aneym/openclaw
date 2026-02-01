#!/usr/bin/env bash
# Start gateway (dev profile) + Vite UI for local development.
# Reads the gateway token from the dev config so the printed URL works.

set -euo pipefail

CONFIG="${HOME}/.openclaw-dev/openclaw.json"

# Read token from dev config (config takes precedence over env in auth.ts)
TOKEN=""
if [ -f "$CONFIG" ]; then
  TOKEN=$(node -e "
    const c = JSON.parse(require('fs').readFileSync('$CONFIG','utf8'));
    process.stdout.write(c.gateway?.auth?.token ?? '');
  " 2>/dev/null || true)
fi

export OPENCLAW_PROFILE=dev
export OPENCLAW_SKIP_CHANNELS=1

pnpm gateway:watch &
pnpm ui:dev &

sleep 4
if [ -n "$TOKEN" ]; then
  printf '\n  Dev UI: http://localhost:5173/?token=%s\n\n' "$TOKEN"
else
  printf '\n  Dev UI: http://localhost:5173/\n  (no token configured in %s)\n\n' "$CONFIG"
fi

wait
