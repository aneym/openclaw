import { useEffect, useRef } from "react";
import {
  useGatewayStore,
  type ExecApprovalRequest,
  type ToolApprovalRequest,
} from "../stores/gateway-store";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// ── Exec approval parsing ────────────────────────────────────────

function parseExecApprovalRequested(payload: unknown): ExecApprovalRequest | null {
  if (!isRecord(payload)) {
    return null;
  }
  const id = typeof payload.id === "string" ? payload.id.trim() : "";
  const request = payload.request;
  if (!id || !isRecord(request)) {
    return null;
  }
  const command = typeof request.command === "string" ? request.command.trim() : "";
  if (!command) {
    return null;
  }
  const createdAtMs = typeof payload.createdAtMs === "number" ? payload.createdAtMs : 0;
  const expiresAtMs = typeof payload.expiresAtMs === "number" ? payload.expiresAtMs : 0;
  if (!createdAtMs || !expiresAtMs) {
    return null;
  }
  return {
    id,
    request: {
      command,
      cwd: typeof request.cwd === "string" ? request.cwd : null,
      host: typeof request.host === "string" ? request.host : null,
      security: typeof request.security === "string" ? request.security : null,
      ask: typeof request.ask === "string" ? request.ask : null,
      agentId: typeof request.agentId === "string" ? request.agentId : null,
      resolvedPath: typeof request.resolvedPath === "string" ? request.resolvedPath : null,
      sessionKey: typeof request.sessionKey === "string" ? request.sessionKey : null,
    },
    createdAtMs,
    expiresAtMs,
  };
}

function parseExecApprovalResolved(payload: unknown): { id: string } | null {
  if (!isRecord(payload)) {
    return null;
  }
  const id = typeof payload.id === "string" ? payload.id.trim() : "";
  return id ? { id } : null;
}

// ── Tool approval parsing ────────────────────────────────────────

function parseToolApprovalRequested(payload: unknown): ToolApprovalRequest | null {
  if (!isRecord(payload)) {
    return null;
  }
  const id = typeof payload.id === "string" ? payload.id.trim() : "";
  const request = payload.request;
  if (!id || !isRecord(request)) {
    return null;
  }
  const toolName = typeof request.toolName === "string" ? request.toolName.trim() : "";
  if (!toolName) {
    return null;
  }
  const createdAtMs = typeof payload.createdAtMs === "number" ? payload.createdAtMs : 0;
  const expiresAtMs = typeof payload.expiresAtMs === "number" ? payload.expiresAtMs : 0;
  if (!createdAtMs || !expiresAtMs) {
    return null;
  }
  return {
    id,
    request: {
      toolName,
      toolInput: isRecord(request.toolInput) ? (request.toolInput as Record<string, unknown>) : {},
      agentId: typeof request.agentId === "string" ? request.agentId : null,
      sessionKey: typeof request.sessionKey === "string" ? request.sessionKey : null,
    },
    createdAtMs,
    expiresAtMs,
  };
}

function parseToolApprovalResolved(payload: unknown): { id: string } | null {
  if (!isRecord(payload)) {
    return null;
  }
  const id = typeof payload.id === "string" ? payload.id.trim() : "";
  return id ? { id } : null;
}

// ── Queue helpers ────────────────────────────────────────────────

function pruneQueue<T extends { expiresAtMs: number }>(queue: T[]): T[] {
  const now = Date.now();
  return queue.filter((entry) => entry.expiresAtMs > now);
}

function addToQueue<T extends { id: string; expiresAtMs: number }>(queue: T[], entry: T): T[] {
  const next = pruneQueue(queue).filter((item) => item.id !== entry.id);
  next.push(entry);
  return next;
}

function removeFromQueue<T extends { id: string; expiresAtMs: number }>(
  queue: T[],
  id: string,
): T[] {
  return pruneQueue(queue).filter((entry) => entry.id !== id);
}

// ── Approval resolution RPCs ─────────────────────────────────────

export async function resolveExecApproval(id: string, decision: "allow" | "deny"): Promise<void> {
  const { request, connected } = useGatewayStore.getState();
  if (!connected) {
    return;
  }

  try {
    await request("exec.approval.resolve", { id, decision });
  } catch (err) {
    console.error("[resolveExecApproval] failed:", err);
  }
}

export async function resolveToolApproval(id: string, decision: "allow" | "deny"): Promise<void> {
  const { request, connected } = useGatewayStore.getState();
  if (!connected) {
    return;
  }

  try {
    await request("tool.approval.resolve", { id, decision });
  } catch (err) {
    console.error("[resolveToolApproval] failed:", err);
  }
}

// ── Hook ─────────────────────────────────────────────────────────

/**
 * Subscribe to approval events and manage the queue state.
 * Call once at app level alongside useSessionSync.
 */
export function useApprovalSync(): void {
  const subscribe = useGatewayStore((s) => s.subscribe);
  const connected = useGatewayStore((s) => s.connected);
  const timersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  useEffect(() => {
    // If Fast Refresh re-runs this effect, make sure we don't leak timers.
    for (const timer of timersRef.current) {
      clearTimeout(timer);
    }
    timersRef.current = [];

    const unsubs = [
      subscribe("exec.approval.requested", (payload) => {
        const entry = parseExecApprovalRequested(payload);
        if (!entry) {
          return;
        }
        const { execApprovalQueue, setExecApprovalQueue } = useGatewayStore.getState();
        setExecApprovalQueue(addToQueue(execApprovalQueue, entry));

        // Auto-prune on expiry
        const delay = Math.max(0, entry.expiresAtMs - Date.now() + 500);
        const timer = setTimeout(() => {
          const { execApprovalQueue: q, setExecApprovalQueue: setQ } = useGatewayStore.getState();
          setQ(pruneQueue(q));
        }, delay);
        timersRef.current.push(timer);
      }),

      subscribe("exec.approval.resolved", (payload) => {
        const resolved = parseExecApprovalResolved(payload);
        if (!resolved) {
          return;
        }
        const { execApprovalQueue, setExecApprovalQueue } = useGatewayStore.getState();
        setExecApprovalQueue(removeFromQueue(execApprovalQueue, resolved.id));
      }),

      subscribe("tool.approval.requested", (payload) => {
        const entry = parseToolApprovalRequested(payload);
        if (!entry) {
          return;
        }
        const { toolApprovalQueue, setToolApprovalQueue } = useGatewayStore.getState();
        setToolApprovalQueue(addToQueue(toolApprovalQueue, entry));

        // Auto-prune on expiry
        const delay = Math.max(0, entry.expiresAtMs - Date.now() + 500);
        const timer = setTimeout(() => {
          const { toolApprovalQueue: q, setToolApprovalQueue: setQ } = useGatewayStore.getState();
          setQ(pruneQueue(q));
        }, delay);
        timersRef.current.push(timer);
      }),

      subscribe("tool.approval.resolved", (payload) => {
        const resolved = parseToolApprovalResolved(payload);
        if (!resolved) {
          return;
        }
        const { toolApprovalQueue, setToolApprovalQueue } = useGatewayStore.getState();
        setToolApprovalQueue(removeFromQueue(toolApprovalQueue, resolved.id));
      }),
    ];

    return () => {
      unsubs.forEach((fn) => fn());
      for (const timer of timersRef.current) {
        clearTimeout(timer);
      }
      timersRef.current = [];
    };
  }, [subscribe]);

  // Clear queues on disconnect
  useEffect(() => {
    if (!connected) {
      const { setExecApprovalQueue, setToolApprovalQueue } = useGatewayStore.getState();
      setExecApprovalQueue([]);
      setToolApprovalQueue([]);
    }
  }, [connected]);
}
