import { useEffect, useMemo } from "react";
import {
  useGatewayStore,
  type SubagentRunInfo,
  type SubagentEventPayload,
} from "../stores/gateway-store";

/** Stale run removal delay (ms) — keep completed runs briefly for the "done" flash. */
const SUBAGENT_DONE_LINGER_MS = 5_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseSubagentEvent(payload: unknown): SubagentEventPayload | null {
  if (!isRecord(payload)) {
    return null;
  }
  const runId = typeof payload.runId === "string" ? payload.runId : "";
  const requesterSessionKey =
    typeof payload.requesterSessionKey === "string" ? payload.requesterSessionKey : "";
  if (!runId || !requesterSessionKey) {
    return null;
  }
  return {
    phase: payload.phase as SubagentEventPayload["phase"],
    runId,
    requesterSessionKey,
    childSessionKey: typeof payload.childSessionKey === "string" ? payload.childSessionKey : "",
    task: typeof payload.task === "string" ? payload.task : "",
    label: typeof payload.label === "string" ? payload.label : undefined,
    startedAt: typeof payload.startedAt === "number" ? payload.startedAt : undefined,
    endedAt: typeof payload.endedAt === "number" ? payload.endedAt : undefined,
    outcome: isRecord(payload.outcome)
      ? {
          status: payload.outcome.status as "ok" | "error",
          error: typeof payload.outcome.error === "string" ? payload.outcome.error : undefined,
        }
      : undefined,
  };
}

function applySubagentEvent(evt: SubagentEventPayload): void {
  const { subagentRuns, setSubagentRuns } = useGatewayStore.getState();
  const map = new Map(subagentRuns);
  const key = evt.requesterSessionKey;
  const existing = (map.get(key) ?? []).slice();

  if (evt.phase === "start") {
    // Add or update
    const idx = existing.findIndex((r) => r.runId === evt.runId);
    const info: SubagentRunInfo = {
      runId: evt.runId,
      childSessionKey: evt.childSessionKey,
      requesterSessionKey: evt.requesterSessionKey,
      task: evt.task,
      label: evt.label,
      createdAt: evt.startedAt ?? Date.now(),
      startedAt: evt.startedAt,
    };
    if (idx >= 0) {
      existing[idx] = info;
    } else {
      existing.push(info);
    }
    map.set(key, existing);
  } else {
    // end or error
    const idx = existing.findIndex((r) => r.runId === evt.runId);
    if (idx >= 0) {
      existing[idx] = {
        ...existing[idx],
        endedAt: evt.endedAt ?? Date.now(),
        outcome: evt.outcome ?? {
          status: evt.phase === "error" ? "error" : "ok",
        },
      };
      map.set(key, existing);
    }
    // Schedule removal after linger
    setTimeout(() => {
      const current = new Map(useGatewayStore.getState().subagentRuns);
      const list = (current.get(key) ?? []).filter((r) => r.runId !== evt.runId);
      if (list.length > 0) {
        current.set(key, list);
      } else {
        current.delete(key);
      }
      useGatewayStore.getState().setSubagentRuns(current);
    }, SUBAGENT_DONE_LINGER_MS);
  }

  setSubagentRuns(map);
}

async function fetchSubagentRuns(): Promise<void> {
  const { request, connected } = useGatewayStore.getState();
  if (!connected) {
    return;
  }

  try {
    const res = await request<{ runs?: SubagentRunInfo[] }>("subagents.list", {});
    const runs = Array.isArray(res?.runs) ? res.runs : [];
    const map = new Map<string, SubagentRunInfo[]>();
    for (const r of runs) {
      const key = r.requesterSessionKey;
      const list = map.get(key) ?? [];
      list.push(r);
      map.set(key, list);
    }
    useGatewayStore.getState().setSubagentRuns(map);
  } catch {
    // Graceful degradation: older gateways may not support subagents.list
  }
}

/**
 * Hook to subscribe to subagent events and sync state.
 * Call once at app level (e.g. in App.tsx alongside useSessionSync).
 */
export function useSubagentSync(): void {
  const subscribe = useGatewayStore((s) => s.subscribe);
  const connected = useGatewayStore((s) => s.connected);

  // Subscribe to subagent events
  useEffect(() => {
    const unsub = subscribe("subagent", (payload) => {
      const evt = parseSubagentEvent(payload);
      if (evt) {
        applySubagentEvent(evt);
      }
    });
    return unsub;
  }, [subscribe]);

  // Fetch subagent runs on connect
  useEffect(() => {
    if (connected) {
      void fetchSubagentRuns();
    } else {
      // Clear on disconnect
      useGatewayStore.getState().setSubagentRuns(new Map());
    }
  }, [connected]);
}

/**
 * Get subagent runs for a specific session key.
 * Returns a stable empty array when no runs exist.
 */
export function useSubagentRuns(sessionKey: string | undefined): SubagentRunInfo[] {
  const subagentRuns = useGatewayStore((s) => s.subagentRuns);
  return useMemo(() => {
    if (!sessionKey) {
      return EMPTY_RUNS;
    }
    return subagentRuns.get(sessionKey) ?? EMPTY_RUNS;
  }, [subagentRuns, sessionKey]);
}

const EMPTY_RUNS: SubagentRunInfo[] = [];
