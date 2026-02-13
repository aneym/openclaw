#!/usr/bin/env bash
# Start gateway + Vite UI for local development.
# Uses the main state directory (~/.openclaw/) so dev and prod share memory/sessions.
# Gateway runs in manual mode by default (no restart on source edits). Set
# OPENCLAW_DEV_ALL_GATEWAY_MODE=watch to restore watch-mode restarts.
# Both processes auto-restart on crash with a 2-second cooldown.

set -euo pipefail

SHUTTING_DOWN=false
RUNTIME_DIR="${OPENCLAW_DEV_ALL_RUNTIME_DIR:-${TMPDIR:-/tmp}/openclaw-dev-all}"
GATEWAY_PID_FILE="${RUNTIME_DIR}/gateway.pid"
GATEWAY_MODE="${OPENCLAW_DEV_ALL_GATEWAY_MODE:-manual}"
KEYBOARD_RESTART_ENABLED=false
TTY_FD=3

mkdir -p "$RUNTIME_DIR"
rm -f "$GATEWAY_PID_FILE"

shutdown() {
  SHUTTING_DOWN=true
  rm -f "$GATEWAY_PID_FILE"
  kill 0 2>/dev/null || true
}

trap shutdown INT TERM
trap 'rm -f "$GATEWAY_PID_FILE"' EXIT

CONFIG="${HOME}/.openclaw/openclaw.json"

# Read token from config for the dev UI URL
TOKEN=""
TOKEN_ENCODED=""
GATEWAY_PORT="18789"
if [ -f "$CONFIG" ]; then
  TOKEN=$(node -e "
    const c = JSON.parse(require('fs').readFileSync('$CONFIG','utf8'));
    process.stdout.write(c.gateway?.auth?.token ?? '');
  " 2>/dev/null || true)
  GATEWAY_PORT=$(node -e "
    const c = JSON.parse(require('fs').readFileSync('$CONFIG','utf8'));
    process.stdout.write(String(c.gateway?.port ?? 18789));
  " 2>/dev/null || true)
fi
if ! [[ "$GATEWAY_PORT" =~ ^[0-9]+$ ]]; then
  GATEWAY_PORT="18789"
fi
if [ -n "$TOKEN" ]; then
  TOKEN_ENCODED=$(node -e "process.stdout.write(encodeURIComponent(process.argv[1] ?? ''))" "$TOKEN" 2>/dev/null || true)
fi

# Kill stale Vite dev server if port 3636 is still held
lsof -ti :3636 | xargs kill -9 2>/dev/null || true

# Auto-restart wrapper: runs a command in a loop, restarting on crash
run_with_restart() {
  local label="$1"; shift
  while ! $SHUTTING_DOWN; do
    printf '\033[1;34m[dev-all]\033[0m Starting %s...\n' "$label"
    "$@" </dev/null &
    local child_pid=$!
    if [ "$label" = "gateway" ]; then
      printf '%s\n' "$child_pid" > "$GATEWAY_PID_FILE"
    fi

    set +e
    wait "$child_pid"
    local exit_code=$?
    set -e

    if [ "$label" = "gateway" ]; then
      rm -f "$GATEWAY_PID_FILE"
    fi
    if $SHUTTING_DOWN; then break; fi
    printf '\033[1;33m[dev-all]\033[0m %s exited (%s), restarting in 2s...\n' "$label" "$exit_code"
    sleep 2
  done
}

restart_gateway_now() {
  if [ ! -f "$GATEWAY_PID_FILE" ]; then
    printf '\033[1;33m[dev-all]\033[0m Gateway pid file not found, cannot restart yet.\n'
    return
  fi

  local pid
  pid="$(tr -d '[:space:]' < "$GATEWAY_PID_FILE")"
  if [ -z "$pid" ] || ! [[ "$pid" =~ ^[0-9]+$ ]]; then
    printf '\033[1;31m[dev-all]\033[0m Invalid gateway pid in %s.\n' "$GATEWAY_PID_FILE"
    return
  fi

  if kill -0 "$pid" 2>/dev/null; then
    kill -TERM "$pid"
    printf '\033[1;34m[dev-all]\033[0m Manual restart requested (sent SIGTERM to gateway pid %s).\n' "$pid"
    return
  fi

  printf '\033[1;33m[dev-all]\033[0m Gateway pid %s is not running.\n' "$pid"
}

keyboard_restart_loop() {
  while ! $SHUTTING_DOWN; do
    local key=""
    if ! IFS= read -rsn1 -t 1 -u "$TTY_FD" key; then
      continue
    fi
    case "$key" in
      r|R)
        restart_gateway_now
        ;;
    esac
  done
}

case "$GATEWAY_MODE" in
  manual)
    GATEWAY_CMD=(pnpm openclaw gateway --force)
    ;;
  watch)
    GATEWAY_CMD=(pnpm gateway:watch)
    ;;
  *)
    printf '\033[1;31m[dev-all]\033[0m Invalid OPENCLAW_DEV_ALL_GATEWAY_MODE=%s (use "manual" or "watch").\n' "$GATEWAY_MODE" >&2
    exit 1
    ;;
esac

printf '\033[1;34m[dev-all]\033[0m Gateway mode: %s\n' "$GATEWAY_MODE"
printf '\033[1;34m[dev-all]\033[0m Restart command: pnpm dev:all:gateway:restart\n'
if [ -r /dev/tty ]; then
  exec 3</dev/tty
  KEYBOARD_RESTART_ENABLED=true
  printf '\033[1;34m[dev-all]\033[0m Hotkey: press "r" in this terminal to restart gateway.\n'
fi

run_with_restart "gateway" "${GATEWAY_CMD[@]}" &
run_with_restart "ui" pnpm ui:dev &

if $KEYBOARD_RESTART_ENABLED; then
  keyboard_restart_loop &
fi

sleep 4
if [ -n "$TOKEN_ENCODED" ]; then
  printf '\n  Dev UI: http://localhost:3636/#token=%s\n  kOS Gateway: ws://localhost:%s#token=%s\n  Restart gateway: pnpm dev:all:gateway:restart or press "r"\n\n' "$TOKEN_ENCODED" "$GATEWAY_PORT" "$TOKEN_ENCODED"
else
  printf '\n  Dev UI: http://localhost:3636/\n  kOS Gateway: ws://localhost:%s\n  (no token configured in %s)\n  Restart gateway: pnpm dev:all:gateway:restart or press "r"\n\n' "$GATEWAY_PORT" "$CONFIG"
fi

wait
