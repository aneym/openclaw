export type ToolApprovalRequestPayload = {
  toolName: string;
  toolInput: Record<string, unknown>;
  agentId?: string | null;
  sessionKey?: string | null;
};

export type ToolApprovalRequest = {
  id: string;
  request: ToolApprovalRequestPayload;
  createdAtMs: number;
  expiresAtMs: number;
};

export type ToolApprovalResolved = {
  id: string;
  decision?: string | null;
  resolvedBy?: string | null;
  ts?: number | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parseToolApprovalRequested(payload: unknown): ToolApprovalRequest | null {
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
      toolInput: isRecord(request.toolInput) ? request.toolInput : {},
      agentId: typeof request.agentId === "string" ? request.agentId : null,
      sessionKey: typeof request.sessionKey === "string" ? request.sessionKey : null,
    },
    createdAtMs,
    expiresAtMs,
  };
}

export function parseToolApprovalResolved(payload: unknown): ToolApprovalResolved | null {
  if (!isRecord(payload)) {
    return null;
  }
  const id = typeof payload.id === "string" ? payload.id.trim() : "";
  if (!id) {
    return null;
  }
  return {
    id,
    decision: typeof payload.decision === "string" ? payload.decision : null,
    resolvedBy: typeof payload.resolvedBy === "string" ? payload.resolvedBy : null,
    ts: typeof payload.ts === "number" ? payload.ts : null,
  };
}

export function pruneToolApprovalQueue(queue: ToolApprovalRequest[]): ToolApprovalRequest[] {
  const now = Date.now();
  return queue.filter((entry) => entry.expiresAtMs > now);
}

export function addToolApproval(
  queue: ToolApprovalRequest[],
  entry: ToolApprovalRequest,
): ToolApprovalRequest[] {
  const next = pruneToolApprovalQueue(queue).filter((item) => item.id !== entry.id);
  next.push(entry);
  return next;
}

export function removeToolApproval(
  queue: ToolApprovalRequest[],
  id: string,
): ToolApprovalRequest[] {
  return pruneToolApprovalQueue(queue).filter((entry) => entry.id !== id);
}
