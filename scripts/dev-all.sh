#!/usr/bin/env bash
# Start gateway (dev profile) + Vite UI for local development.
# Auto-syncs prod config → dev config (preserving dev auth overrides).

set -euo pipefail

PROD_CONFIG="${HOME}/.openclaw/openclaw.json"
DEV_DIR="${HOME}/.openclaw-dev"
DEV_CONFIG="${DEV_DIR}/openclaw.json"

mkdir -p "$DEV_DIR"

# Sync prod config to dev if prod is newer (or dev doesn't exist yet).
# Preserves the dev auth token so the gateway stays independently authenticated.
if [ -f "$PROD_CONFIG" ]; then
  if [ ! -f "$DEV_CONFIG" ] || [ "$PROD_CONFIG" -nt "$DEV_CONFIG" ]; then
    node -e "
      const fs = require('fs');
      const prod = JSON.parse(fs.readFileSync('$PROD_CONFIG', 'utf8'));
      let dev = {};
      try { dev = JSON.parse(fs.readFileSync('$DEV_CONFIG', 'utf8')); } catch {}
      const devToken = dev.gateway?.auth?.token ?? 'dev';
      const merged = { ...prod };
      merged.gateway = { ...prod.gateway, port: 18790, auth: { mode: 'token', token: devToken } };
      fs.writeFileSync('$DEV_CONFIG', JSON.stringify(merged, null, 2) + '\n');
    " 2>/dev/null && printf '[dev-all] synced prod config → %s\n' "$DEV_CONFIG"
  fi
fi

# Read token from dev config (config takes precedence over env in auth.ts)
TOKEN=""
if [ -f "$DEV_CONFIG" ]; then
  TOKEN=$(node -e "
    const c = JSON.parse(require('fs').readFileSync('$DEV_CONFIG','utf8'));
    process.stdout.write(c.gateway?.auth?.token ?? '');
  " 2>/dev/null || true)
fi

export OPENCLAW_PROFILE=dev
export OPENCLAW_SKIP_CHANNELS=1

# Kill stale Vite dev server if port 5173 is still held
lsof -ti :5173 | xargs kill -9 2>/dev/null || true

pnpm gateway:watch &
pnpm ui:dev &

sleep 4
if [ -n "$TOKEN" ]; then
  printf '\n  Dev UI: http://localhost:5173/?token=%s\n\n' "$TOKEN"
else
  printf '\n  Dev UI: http://localhost:5173/\n  (no token configured in %s)\n\n' "$DEV_CONFIG"
fi

wait
