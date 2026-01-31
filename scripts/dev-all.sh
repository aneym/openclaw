#!/usr/bin/env bash
# Start gateway (dev profile) + Vite UI for local development.
# Generates a stable dev token on first run, reuses it on subsequent runs.

set -euo pipefail

STATE_DIR="${HOME}/.openclaw-dev"
TOKEN_FILE="${STATE_DIR}/.dev-token"

mkdir -p "$STATE_DIR"
if [ ! -f "$TOKEN_FILE" ]; then
  openssl rand -hex 24 > "$TOKEN_FILE"
fi
TOKEN=$(cat "$TOKEN_FILE")

export OPENCLAW_PROFILE=dev
export OPENCLAW_SKIP_CHANNELS=1
export OPENCLAW_GATEWAY_TOKEN="$TOKEN"

pnpm gateway:watch &
pnpm ui:dev &

sleep 4
printf '\n  Dev UI: http://localhost:5173/?token=%s\n\n' "$TOKEN"

wait
