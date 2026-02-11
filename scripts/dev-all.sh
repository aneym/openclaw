#!/usr/bin/env bash
# Start gateway + Vite UI for local development.
# Uses the main state directory (~/.openclaw/) so dev and prod share memory/sessions.
# Both processes auto-restart on crash with a 2-second cooldown.

set -euo pipefail

SHUTTING_DOWN=false
trap 'SHUTTING_DOWN=true; kill 0 2>/dev/null' INT TERM

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

# Auto-restart wrapper: runs a command in a loop, restarting on crash
run_with_restart() {
  local label="$1"; shift
  while ! $SHUTTING_DOWN; do
    printf '\033[1;34m[dev-all]\033[0m Starting %s...\n' "$label"
    "$@" || true
    if $SHUTTING_DOWN; then break; fi
    printf '\033[1;33m[dev-all]\033[0m %s exited, restarting in 2s...\n' "$label"
    sleep 2
  done
}

run_with_restart "gateway" pnpm gateway:watch &
run_with_restart "ui" pnpm ui:dev &

sleep 4
if [ -n "$TOKEN" ]; then
  printf '\n  Dev UI: http://localhost:3636/?token=%s\n\n' "$TOKEN"
else
  printf '\n  Dev UI: http://localhost:3636/\n  (no token configured in %s)\n\n' "$CONFIG"
fi

wait
