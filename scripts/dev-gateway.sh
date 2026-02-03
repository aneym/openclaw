#!/usr/bin/env bash
# --------------------------------------------------------------------------
# dev-gateway.sh — Run an isolated dev gateway alongside the main one.
#
# Usage:
#   ./scripts/dev-gateway.sh              # start the dev gateway (foreground)
#   ./scripts/dev-gateway.sh --bg         # start in background (daemonize)
#   ./scripts/dev-gateway.sh --reset      # nuke dev state and start fresh (fg)
#   ./scripts/dev-gateway.sh --stop       # stop the dev gateway
#   ./scripts/dev-gateway.sh --status     # show dev gateway process info
#   ./scripts/dev-gateway.sh --logs       # tail dev gateway logs
#
# Isolation:
#   OPENCLAW_STATE_DIR  → ~/.openclaw-dev  (config, sessions, credentials, logs)
#   Workspace           → ~/.openclaw/workspace-dev  (agent files, C3-PO identity)
#   Port                → 19001  (main stays on 18789)
#   Lock                → separate (hash of config path)
#   Auth                → token "dev" (loopback only)
#   OPENCLAW_GATEWAY_DEV=1 → enables /api/rpc HTTP endpoint
#
# Connect the webchat (localhost:5173) via Overview:
#   WebSocket URL: ws://localhost:19001
#   Gateway Token: dev
# --------------------------------------------------------------------------
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

DEV_STATE_DIR="$HOME/.openclaw-dev"
DEV_PORT=19001
DEV_LOG_FILE="$DEV_STATE_DIR/gateway.log"

action="${1:-start}"

find_gateway_pid() {
  /usr/sbin/lsof -nP -iTCP:"$DEV_PORT" -sTCP:LISTEN -t 2>/dev/null | head -1
}

stop_dev() {
  local pid
  pid=$(find_gateway_pid)
  if [[ -n "$pid" ]]; then
    echo "Stopping dev gateway (PID $pid on port $DEV_PORT)..."
    # Walk up the process tree to find the root parent
    local kill_pids="$pid"
    local ppid
    ppid=$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d ' ')
    while [[ -n "$ppid" ]] && [[ "$ppid" != "1" ]] && [[ "$ppid" != "0" ]]; do
      local pname
      pname=$(ps -o comm= -p "$ppid" 2>/dev/null || true)
      [[ "$pname" == *"openclaw"* ]] || [[ "$pname" == *"node"* ]] || break
      kill_pids="$ppid $kill_pids"
      ppid=$(ps -o ppid= -p "$ppid" 2>/dev/null | tr -d ' ')
    done
    kill $kill_pids 2>/dev/null || true
    for i in {1..30}; do
      [[ -z "$(find_gateway_pid)" ]] && break
      sleep 0.1
    done
    if [[ -n "$(find_gateway_pid)" ]]; then
      kill -9 $(find_gateway_pid) 2>/dev/null || true
    fi
    echo "Stopped."
  else
    echo "Dev gateway not running on port $DEV_PORT."
  fi
}

status_dev() {
  local pid
  pid=$(find_gateway_pid)
  if [[ -n "$pid" ]]; then
    echo "Dev gateway running (PID $pid) on port $DEV_PORT"
    echo ""
    echo "  State dir:  $DEV_STATE_DIR"
    echo "  Config:     $DEV_STATE_DIR/openclaw.json"
    echo "  Workspace:  $HOME/.openclaw/workspace-dev"
    echo "  Log:        $DEV_LOG_FILE"
    echo ""
    echo "  Connect:    ws://localhost:$DEV_PORT"
    echo "  Token:      dev"
    return 0
  fi
  echo "Dev gateway not running."
  return 1
}

case "$action" in
  --stop|stop)
    stop_dev
    exit 0
    ;;
  --status|status)
    status_dev
    exit 0
    ;;
  --logs|logs)
    exec tail -f "$DEV_LOG_FILE"
    ;;
  --reset|reset)
    stop_dev
    EXTRA_FLAGS="--reset"
    BACKGROUND=false
    ;;
  --bg|bg)
    if [[ -n "$(find_gateway_pid)" ]]; then
      stop_dev
    fi
    EXTRA_FLAGS=""
    BACKGROUND=true
    ;;
  start|--start)
    if [[ -n "$(find_gateway_pid)" ]]; then
      stop_dev
    fi
    EXTRA_FLAGS=""
    BACKGROUND=false
    ;;
  *)
    echo "Usage: $0 [start|--bg|--reset|--stop|--status|--logs]"
    exit 1
    ;;
esac

mkdir -p "$DEV_STATE_DIR"

echo "Starting dev gateway..."
echo "  State:     $DEV_STATE_DIR"
echo "  Port:      $DEV_PORT"
echo "  Workspace: ~/.openclaw/workspace-dev"
echo ""
echo "Connect webchat → Overview:"
echo "  WebSocket URL:  ws://localhost:$DEV_PORT"
echo "  Gateway Token:  dev"
echo ""

cd "$REPO_ROOT"

if [[ "${BACKGROUND:-false}" == "true" ]]; then
  OPENCLAW_STATE_DIR="$DEV_STATE_DIR" \
    OPENCLAW_GATEWAY_PORT="$DEV_PORT" \
    nohup node openclaw.mjs gateway run \
      --dev ${EXTRA_FLAGS:-} \
      --verbose \
      >> "$DEV_LOG_FILE" 2>&1 &

  echo -n "Waiting for port $DEV_PORT..."
  for i in {1..40}; do
    if [[ -n "$(find_gateway_pid)" ]]; then
      echo " ready!"
      echo "PID: $(find_gateway_pid)"
      echo ""
      echo "Logs: $0 --logs"
      echo "Stop: $0 --stop"
      exit 0
    fi
    echo -n "."
    sleep 0.25
  done
  echo " FAILED"
  tail -20 "$DEV_LOG_FILE" 2>/dev/null || true
  exit 1
else
  # Foreground — Ctrl+C to stop
  echo "(Ctrl+C to stop)"
  echo ""
  exec env \
    OPENCLAW_STATE_DIR="$DEV_STATE_DIR" \
    OPENCLAW_GATEWAY_PORT="$DEV_PORT" \
    node openclaw.mjs gateway run \
      --dev ${EXTRA_FLAGS:-} \
      --verbose
fi
