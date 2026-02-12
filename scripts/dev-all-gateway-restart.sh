#!/usr/bin/env bash
# Restart the gateway process launched by scripts/dev-all.sh.
# This only targets dev:all's foreground gateway, not launchd/systemd services.

set -euo pipefail

RUNTIME_DIR="${OPENCLAW_DEV_ALL_RUNTIME_DIR:-${TMPDIR:-/tmp}/openclaw-dev-all}"
PID_FILE="${RUNTIME_DIR}/gateway.pid"

if [ ! -f "$PID_FILE" ]; then
  echo "[dev-all] No gateway pid file at $PID_FILE." >&2
  echo "[dev-all] Start dev stack with: pnpm dev:all" >&2
  exit 1
fi

pid="$(tr -d '[:space:]' < "$PID_FILE")"
if [ -z "$pid" ] || ! [[ "$pid" =~ ^[0-9]+$ ]]; then
  echo "[dev-all] Invalid pid in $PID_FILE." >&2
  exit 1
fi

if ! kill -0 "$pid" 2>/dev/null; then
  echo "[dev-all] Gateway pid $pid is not running." >&2
  exit 1
fi

kill -TERM "$pid"
echo "[dev-all] Sent SIGTERM to gateway pid $pid."
echo "[dev-all] scripts/dev-all.sh will restart it in ~2 seconds."
