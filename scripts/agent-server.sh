#!/bin/bash

# Agent Server Manager — Each Claude Code agent gets its own isolated gateway
# Usage: ./scripts/agent-server.sh [start|stop|status|port|health|logs|list|cleanup|kill-all] [agent-id]
#
# Spins up a lightweight OpenClaw gateway on an isolated port so agents can
# test backend changes (tool invocations, agent messages, HTTP API) without
# touching the user's personal gateway on port 18789.

MIN_PORT=18790
MAX_PORT=18810
RESERVED_PORT=18789  # User's dev gateway — NEVER touch
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TMP_PREFIX="/tmp/openclaw-agent"

get_agent_id() {
    if [ -n "$1" ]; then
        echo "$1"
    else
        echo "$(date +%s%N | shasum -a 256 | head -c 8)"
    fi
}

get_port_file()  { echo "${TMP_PREFIX}-$1-port"; }
get_pid_file()   { echo "${TMP_PREFIX}-$1-pid"; }
get_log_file()   { echo "${TMP_PREFIX}-$1.log"; }
get_token_file() { echo "${TMP_PREFIX}-$1-token"; }

kill_process_tree() {
    local pid=$1
    [ -z "$pid" ] && return
    local children
    children=$(pgrep -P "$pid" 2>/dev/null)
    for child in $children; do
        kill_process_tree "$child"
    done
    kill -9 "$pid" 2>/dev/null
}

get_agent_port() {
    local agent_id=$1
    local port_file
    port_file=$(get_port_file "$agent_id")
    if [ -f "$port_file" ]; then
        local stored_port
        stored_port=$(cat "$port_file")
        if lsof -i :"$stored_port" >/dev/null 2>&1; then
            echo "$stored_port"
            return 0
        fi
    fi
    return 1
}

get_agent_token() {
    local agent_id=$1
    local token_file
    token_file=$(get_token_file "$agent_id")
    if [ -f "$token_file" ]; then
        cat "$token_file"
    fi
}

list_all_agents() {
    echo "All running agent gateways:"
    local found=0
    shopt -s nullglob
    for port_file in ${TMP_PREFIX}-*-port; do
        if [ -f "$port_file" ]; then
            local port agent_id
            port=$(cat "$port_file")
            agent_id=$(basename "$port_file" | sed "s/openclaw-agent-//" | sed "s/-port//")
            if lsof -i :"$port" >/dev/null 2>&1; then
                echo "  OK Agent $agent_id on port $port"
                found=1
            else
                echo "  STALE $agent_id (port $port not listening) — run cleanup"
            fi
        fi
    done
    shopt -u nullglob
    if [ $found -eq 0 ]; then
        echo "  (none running)"
    fi
}

COMMAND="${1:-status}"
AGENT_ID="${2:-}"

case "$COMMAND" in
    start)
        AGENT_ID=$(get_agent_id "$AGENT_ID")
        PORT_FILE=$(get_port_file "$AGENT_ID")
        PID_FILE=$(get_pid_file "$AGENT_ID")
        LOG_FILE=$(get_log_file "$AGENT_ID")
        TOKEN_FILE=$(get_token_file "$AGENT_ID")

        # Check if this agent already has a running server
        existing_port=$(get_agent_port "$AGENT_ID")
        if [ -n "$existing_port" ]; then
            echo "Agent $AGENT_ID already running on port $existing_port"
            echo "AGENT_ID=$AGENT_ID"
            echo "PORT=$existing_port"
            echo "TOKEN=$(get_agent_token "$AGENT_ID")"
            exit 0
        fi

        # Atomically claim an available port
        port=""
        for try_port in $(seq $MIN_PORT $MAX_PORT); do
            if lsof -i :"$try_port" >/dev/null 2>&1; then
                continue
            fi
            lock_dir="/tmp/openclaw-port-$try_port.lock"
            if mkdir "$lock_dir" 2>/dev/null; then
                claimed=false
                for pf in ${TMP_PREFIX}-*-port; do
                    if [ -f "$pf" ] && [ "$(cat "$pf" 2>/dev/null)" = "$try_port" ]; then
                        claimed=true
                        break
                    fi
                done
                if [ "$claimed" = false ]; then
                    port=$try_port
                    break
                fi
                rmdir "$lock_dir" 2>/dev/null
            fi
        done

        if [ -z "$port" ]; then
            echo "ERROR: No available ports in range $MIN_PORT-$MAX_PORT" >&2
            exit 1
        fi

        # Read the gateway token from the existing config (--dev reuses the user's config,
        # so the real token is what the gateway will actually enforce for HTTP auth).
        gateway_token=""
        config_path="${HOME}/.clawdbot/openclaw.json"
        if [ -f "$config_path" ]; then
            gateway_token=$(python3 -c "import json,sys; d=json.load(open('$config_path')); print(d.get('gateway',{}).get('auth',{}).get('token',''))" 2>/dev/null)
        fi
        if [ -z "$gateway_token" ]; then
            gateway_token="${OPENCLAW_GATEWAY_TOKEN:-${CLAWDBOT_GATEWAY_TOKEN:-}}"
        fi
        if [ -z "$gateway_token" ]; then
            echo "ERROR: No gateway token found in config or env. Set gateway.auth.token in config." >&2
            rm -f "$PORT_FILE"
            exit 1
        fi

        echo "Starting agent $AGENT_ID on port $port..."
        echo "$port" > "$PORT_FILE"
        echo "$gateway_token" > "$TOKEN_FILE"
        rmdir "/tmp/openclaw-port-$port.lock" 2>/dev/null

        # Build first to pick up latest code changes
        echo "Building..."
        cd "$PROJECT_DIR" || exit 1
        if ! pnpm build > "${LOG_FILE}.build" 2>&1; then
            echo "ERROR: Build failed. Check ${LOG_FILE}.build"
            tail -20 "${LOG_FILE}.build" 2>/dev/null
            rm -f "$PORT_FILE" "$TOKEN_FILE"
            exit 1
        fi

        # Start gateway in background with isolated port.
        # OPENCLAW_ALLOW_MULTI_GATEWAY=1 bypasses the singleton lock so we
        # can run alongside the user's real gateway on port 18789.
        # OPENCLAW_GATEWAY_PORT ensures the port is resolved before config load.
        nohup env \
            OPENCLAW_ALLOW_MULTI_GATEWAY=1 \
            OPENCLAW_GATEWAY_PORT="$port" \
            node "$PROJECT_DIR/openclaw.mjs" gateway run \
            --port "$port" \
            --bind loopback \
            --force \
            --dev \
            > "$LOG_FILE" 2>&1 &
        ROOT_PID=$!
        echo "$ROOT_PID" > "$PID_FILE"

        # Wait for server to be ready (check every second, max 30 seconds)
        echo "Waiting for gateway..."
        for i in {1..30}; do
            sleep 1
            # Check if process is still alive
            if ! ps -p $ROOT_PID >/dev/null 2>&1; then
                echo "ERROR: Gateway process died"
                echo "Check logs: $LOG_FILE"
                tail -20 "$LOG_FILE" 2>/dev/null
                rm -f "$PORT_FILE" "$PID_FILE" "$TOKEN_FILE"
                exit 1
            fi
            # Check if port is listening
            if lsof -i :"$port" >/dev/null 2>&1; then
                echo "Gateway ready!"
                echo "Logs: $LOG_FILE"
                echo ""
                echo "AGENT_ID=$AGENT_ID"
                echo "PORT=$port"
                echo "TOKEN=$gateway_token"
                exit 0
            fi
            if [ $((i % 5)) -eq 0 ]; then
                echo "   Still waiting... ($i/30s)"
            fi
        done

        echo "ERROR: Gateway failed to start within 30 seconds"
        echo "Check logs: $LOG_FILE"
        tail -20 "$LOG_FILE" 2>/dev/null
        exit 1
        ;;

    stop)
        if [ -z "$AGENT_ID" ]; then
            echo "Usage: $0 stop <agent-id>"
            echo "  Run '$0 list' to see all running agents"
            exit 1
        fi

        PORT_FILE=$(get_port_file "$AGENT_ID")
        PID_FILE=$(get_pid_file "$AGENT_ID")
        TOKEN_FILE=$(get_token_file "$AGENT_ID")

        port=$(get_agent_port "$AGENT_ID")
        if [ -z "$port" ]; then
            echo "No agent gateway running for ID: $AGENT_ID"
            rm -f "$PORT_FILE" "$PID_FILE" "$TOKEN_FILE"
            exit 0
        fi

        echo "Stopping agent $AGENT_ID on port $port..."

        if [ -f "$PID_FILE" ]; then
            root_pid=$(cat "$PID_FILE")
            if [ -n "$root_pid" ] && ps -p "$root_pid" >/dev/null 2>&1; then
                kill_process_tree "$root_pid"
            fi
        fi

        sleep 1
        pids=$(lsof -t -i:"$port" 2>/dev/null)
        if [ -n "$pids" ]; then
            for pid in $pids; do
                kill_process_tree "$pid"
            done
        fi

        rm -f "$PORT_FILE" "$PID_FILE" "$TOKEN_FILE"

        sleep 1
        if lsof -i :"$port" >/dev/null 2>&1; then
            lsof -t -i:"$port" | xargs kill -9 2>/dev/null
            sleep 1
        fi

        echo "Agent $AGENT_ID stopped"
        ;;

    restart)
        if [ -z "$AGENT_ID" ]; then
            echo "Usage: $0 restart <agent-id>"
            exit 1
        fi
        echo "Restarting agent $AGENT_ID..."
        "$0" stop "$AGENT_ID"
        sleep 2
        "$0" start "$AGENT_ID"
        ;;

    status)
        if [ -z "$AGENT_ID" ]; then
            list_all_agents
            exit 0
        fi
        port=$(get_agent_port "$AGENT_ID")
        if [ -n "$port" ]; then
            token=$(get_agent_token "$AGENT_ID")
            echo "Agent $AGENT_ID running on port $port"
            echo "AGENT_ID=$AGENT_ID"
            echo "PORT=$port"
            echo "TOKEN=$token"
        else
            echo "No agent gateway running for ID: $AGENT_ID"
        fi
        ;;

    port)
        if [ -z "$AGENT_ID" ]; then
            echo "Usage: $0 port <agent-id>"
            exit 1
        fi
        port=$(get_agent_port "$AGENT_ID")
        if [ -n "$port" ]; then
            echo "$port"
        else
            echo "none"
            exit 1
        fi
        ;;

    health)
        if [ -z "$AGENT_ID" ]; then
            echo "Usage: $0 health <agent-id>"
            exit 1
        fi
        port=$(get_agent_port "$AGENT_ID")
        if [ -z "$port" ]; then
            echo "No agent gateway running for ID: $AGENT_ID"
            exit 1
        fi
        echo "Checking port $port..."
        if lsof -i :"$port" >/dev/null 2>&1; then
            echo "OK: Port $port is listening"
        else
            echo "FAIL: Port $port is not listening"
            exit 1
        fi
        ;;

    logs)
        if [ -z "$AGENT_ID" ]; then
            echo "Usage: $0 logs <agent-id> [lines]"
            exit 1
        fi
        LOG_FILE=$(get_log_file "$AGENT_ID")
        LINES="${3:-50}"
        if [ -f "$LOG_FILE" ]; then
            tail -"${LINES}" "$LOG_FILE"
        else
            echo "No log file found at $LOG_FILE"
        fi
        ;;

    list)
        list_all_agents
        ;;

    cleanup)
        echo "Cleaning up stale port/pid/token files..."
        shopt -s nullglob
        for port_file in ${TMP_PREFIX}-*-port; do
            if [ -f "$port_file" ]; then
                port=$(cat "$port_file")
                if ! lsof -i :"$port" >/dev/null 2>&1; then
                    agent_id=$(basename "$port_file" | sed "s/openclaw-agent-//" | sed "s/-port//")
                    echo "  Removing stale: $agent_id (port $port)"
                    rm -f "$port_file"
                    rm -f "$(get_pid_file "$agent_id")"
                    rm -f "$(get_token_file "$agent_id")"
                fi
            fi
        done
        shopt -u nullglob
        echo "Cleanup complete"
        ;;

    kill-all)
        echo "Killing ALL agent gateway processes on ports $MIN_PORT-$MAX_PORT..."
        killed=0
        for port in $(seq $MIN_PORT $MAX_PORT); do
            if [ "$port" = "$RESERVED_PORT" ]; then
                continue
            fi
            pids=$(lsof -t -i:"$port" 2>/dev/null)
            if [ -n "$pids" ]; then
                echo "  Port $port: killing PIDs $pids"
                for pid in $pids; do
                    kill_process_tree "$pid"
                done
                killed=$((killed + 1))
            fi
        done
        rm -f ${TMP_PREFIX}-*-port ${TMP_PREFIX}-*-pid ${TMP_PREFIX}-*-token 2>/dev/null
        rmdir /tmp/openclaw-port-*.lock 2>/dev/null
        if [ $killed -eq 0 ]; then
            echo "No orphaned processes found"
        else
            echo "Killed processes on $killed port(s)"
        fi
        ;;

    *)
        echo "Agent Server Manager — Isolated OpenClaw gateways for testing"
        echo ""
        echo "Usage: $0 <command> [agent-id]"
        echo ""
        echo "Commands:"
        echo "  start [id]     Start new gateway (generates ID if not provided)"
        echo "  stop <id>      Stop gateway for agent ID"
        echo "  restart <id>   Rebuild + restart gateway for agent ID"
        echo "  status [id]    Check status (lists all if no ID)"
        echo "  port <id>      Output just the port number"
        echo "  health <id>    Check if port is listening"
        echo "  logs <id> [n]  Show last n lines of logs (default 50)"
        echo "  list           List all running agent gateways"
        echo "  cleanup        Remove stale port/pid files"
        echo "  kill-all       Kill ALL agent gateway processes"
        echo ""
        echo "Ports: $MIN_PORT-$MAX_PORT (reserved: $RESERVED_PORT)"
        echo "Files: ${TMP_PREFIX}-{ID}-{port,pid,token}"
        exit 1
        ;;
esac
