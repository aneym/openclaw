import type { ThreadState } from "./thread-state";
import { normalizeReasoningText } from "./chat/message-extract";
import { truncateText } from "./format";
import { sessionKeysMatch } from "./session-keys";

const TOOL_STREAM_LIMIT = 50;
const TOOL_STREAM_THROTTLE_MS = 80;
const TOOL_OUTPUT_CHAR_LIMIT = 120_000;

export type AgentEventPayload = {
  runId: string;
  seq: number;
  stream: string;
  ts: number;
  sessionKey?: string;
  data: Record<string, unknown>;
};

export type ToolStreamEntry = {
  toolCallId: string;
  runId: string;
  sessionKey?: string;
  name: string;
  args?: unknown;
  output?: string;
  startedAt: number;
  updatedAt: number;
  message: Record<string, unknown>;
};

type ToolStreamHost = {
  sessionKey: string;
  chatRunId: string | null;
  chatStream: string | null;
  chatStreamReasoning: string | null;
  chatStreamStartedAt: number | null;
  toolStreamById: Map<string, ToolStreamEntry>;
  toolStreamOrder: string[];
  chatToolMessages: Record<string, unknown>[];
  toolStreamSyncTimer: number | null;
};

function extractToolOutputText(value: unknown): string | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.text === "string") {
    return record.text;
  }
  const content = record.content;
  if (!Array.isArray(content)) {
    return null;
  }
  const parts = content
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const entry = item as Record<string, unknown>;
      if (entry.type === "text" && typeof entry.text === "string") {
        return entry.text;
      }
      return null;
    })
    .filter((part): part is string => Boolean(part));
  if (parts.length === 0) {
    return null;
  }
  return parts.join("\n");
}

function formatToolOutput(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  const contentText = extractToolOutputText(value);
  let text: string;
  if (typeof value === "string") {
    text = value;
  } else if (contentText) {
    text = contentText;
  } else {
    try {
      text = JSON.stringify(value, null, 2);
    } catch {
      text = String(value);
    }
  }
  const truncated = truncateText(text, TOOL_OUTPUT_CHAR_LIMIT);
  if (!truncated.truncated) {
    return truncated.text;
  }
  return `${truncated.text}\n\n… truncated (${truncated.total} chars, showing first ${truncated.text.length}).`;
}

function buildToolStreamMessage(entry: ToolStreamEntry): Record<string, unknown> {
  const content: Array<Record<string, unknown>> = [];
  content.push({
    type: "toolcall",
    name: entry.name,
    arguments: entry.args ?? {},
  });
  if (entry.output) {
    content.push({
      type: "toolresult",
      name: entry.name,
      text: entry.output,
    });
  }
  return {
    role: "assistant",
    toolCallId: entry.toolCallId,
    runId: entry.runId,
    content,
    timestamp: entry.startedAt,
  };
}

function trimToolStream(host: ToolStreamHost) {
  if (host.toolStreamOrder.length <= TOOL_STREAM_LIMIT) {
    return;
  }
  const overflow = host.toolStreamOrder.length - TOOL_STREAM_LIMIT;
  const removed = host.toolStreamOrder.splice(0, overflow);
  for (const id of removed) {
    host.toolStreamById.delete(id);
  }
}

function syncToolStreamMessages(host: ToolStreamHost) {
  host.chatToolMessages = host.toolStreamOrder
    .map((id) => host.toolStreamById.get(id)?.message)
    .filter((msg): msg is Record<string, unknown> => Boolean(msg));
}

export function flushToolStreamSync(host: ToolStreamHost) {
  if (host.toolStreamSyncTimer != null) {
    clearTimeout(host.toolStreamSyncTimer);
    host.toolStreamSyncTimer = null;
  }
  syncToolStreamMessages(host);
}

export function scheduleToolStreamSync(host: ToolStreamHost, force = false) {
  if (force) {
    flushToolStreamSync(host);
    return;
  }
  if (host.toolStreamSyncTimer != null) {
    return;
  }
  host.toolStreamSyncTimer = window.setTimeout(
    () => flushToolStreamSync(host),
    TOOL_STREAM_THROTTLE_MS,
  );
}

export function resetToolStream(host: ToolStreamHost) {
  host.toolStreamById.clear();
  host.toolStreamOrder = [];
  host.chatToolMessages = [];
  flushToolStreamSync(host);
}

export type CompactionStatus = {
  active: boolean;
  startedAt: number | null;
  completedAt: number | null;
};

type CompactionHost = ToolStreamHost & {
  compactionStatus?: CompactionStatus | null;
  compactionClearTimer?: number | null;
};

const COMPACTION_TOAST_DURATION_MS = 5000;

export function handleCompactionEvent(host: CompactionHost, payload: AgentEventPayload) {
  const data = payload.data ?? {};
  const phase = typeof data.phase === "string" ? data.phase : "";

  // Clear any existing timer
  if (host.compactionClearTimer != null) {
    window.clearTimeout(host.compactionClearTimer);
    host.compactionClearTimer = null;
  }

  if (phase === "start") {
    host.compactionStatus = {
      active: true,
      startedAt: Date.now(),
      completedAt: null,
    };
  } else if (phase === "end") {
    host.compactionStatus = {
      active: false,
      startedAt: host.compactionStatus?.startedAt ?? null,
      completedAt: Date.now(),
    };
    // Auto-clear the toast after duration
    host.compactionClearTimer = window.setTimeout(() => {
      host.compactionStatus = null;
      host.compactionClearTimer = null;
    }, COMPACTION_TOAST_DURATION_MS);
  }
}

function applyThinkingStream(host: ToolStreamHost, payload: AgentEventPayload): boolean {
  const data = payload.data ?? {};
  const fullText = typeof data.text === "string" ? normalizeReasoningText(data.text) : "";
  const rawDelta = typeof data.delta === "string" ? data.delta : "";
  const current = host.chatStreamReasoning ?? "";
  const delta = !current ? normalizeReasoningText(rawDelta) : rawDelta;
  if (!fullText && !delta) {
    return false;
  }
  if (fullText) {
    if (!current || fullText.length >= current.length) {
      host.chatStreamReasoning = fullText;
      return true;
    }
    return false;
  }

  if (!current) {
    host.chatStreamReasoning = delta;
    return true;
  }
  if (delta.startsWith(current)) {
    host.chatStreamReasoning = delta;
    return true;
  }
  if (current.includes(delta)) {
    return false;
  }
  host.chatStreamReasoning = `${current}${delta}`;
  return true;
}

export function handleAgentEvent(host: ToolStreamHost, payload?: AgentEventPayload) {
  if (!payload) {
    return;
  }

  const isCompaction = payload.stream === "compaction";
  if (
    !isCompaction &&
    payload.stream !== "tool" &&
    payload.stream !== "thinking" &&
    payload.stream !== "reasoning"
  ) {
    return;
  }
  const sessionKey = typeof payload.sessionKey === "string" ? payload.sessionKey : undefined;
  if (sessionKey && !sessionKeysMatch(sessionKey, host.sessionKey)) {
    return;
  }

  if (isCompaction) {
    if (!sessionKey) {
      // Session-less compaction events are ambiguous; only accept when
      // they clearly match the currently tracked run for this host.
      if (!host.chatRunId || payload.runId !== host.chatRunId) {
        return;
      }
    } else if (host.chatRunId && payload.runId !== host.chatRunId) {
      return;
    }
    handleCompactionEvent(host as CompactionHost, payload);
    return;
  }

  // Fallback: only accept session-less events for the active run.
  if (!sessionKey && host.chatRunId && payload.runId !== host.chatRunId) {
    return;
  }
  if (host.chatRunId && payload.runId !== host.chatRunId) {
    return;
  }
  if (!host.chatRunId) {
    host.chatRunId = payload.runId;
    if (host.chatStream == null) {
      host.chatStream = "";
    }
    if (!host.chatStreamStartedAt) {
      host.chatStreamStartedAt = typeof payload.ts === "number" ? payload.ts : Date.now();
    }
  }

  if (payload.stream === "thinking" || payload.stream === "reasoning") {
    void applyThinkingStream(host, payload);
    return;
  }

  const data = payload.data ?? {};
  const toolCallId = typeof data.toolCallId === "string" ? data.toolCallId : "";
  if (!toolCallId) {
    return;
  }
  const name = typeof data.name === "string" ? data.name : "tool";
  const phase = typeof data.phase === "string" ? data.phase : "";
  const args = phase === "start" ? data.args : undefined;
  const output =
    phase === "update"
      ? (formatToolOutput(data.partialResult) ?? undefined)
      : phase === "result"
        ? (formatToolOutput(data.result) ?? undefined)
        : undefined;

  applyToolEvent(host, {
    toolCallId,
    runId: payload.runId,
    sessionKey,
    name,
    args,
    output,
    ts: payload.ts,
    phase,
  });
}

/** Shared core that applies a parsed tool event to any ToolStreamHost. */
function applyToolEvent(
  host: ToolStreamHost,
  evt: {
    toolCallId: string;
    runId: string;
    sessionKey?: string;
    name: string;
    args?: unknown;
    output?: string;
    ts: number;
    phase: string;
  },
) {
  const now = Date.now();
  let entry = host.toolStreamById.get(evt.toolCallId);
  if (!entry) {
    entry = {
      toolCallId: evt.toolCallId,
      runId: evt.runId,
      sessionKey: evt.sessionKey,
      name: evt.name,
      args: evt.args,
      output: evt.output,
      startedAt: typeof evt.ts === "number" ? evt.ts : now,
      updatedAt: now,
      message: {},
    };
    host.toolStreamById.set(evt.toolCallId, entry);
    host.toolStreamOrder.push(evt.toolCallId);
  } else {
    entry.name = evt.name;
    if (evt.args !== undefined) {
      entry.args = evt.args;
    }
    if (evt.output !== undefined) {
      entry.output = evt.output;
    }
    entry.updatedAt = now;
  }

  entry.message = buildToolStreamMessage(entry);
  trimToolStream(host);
  scheduleToolStreamSync(host, evt.phase === "result");
}

// ---------------------------------------------------------------------------
// Thread-scoped tool stream helpers
// ---------------------------------------------------------------------------

/** Adapter that wraps a ThreadState as a stream host for shared helpers. */
function threadAsToolStreamHost(thread: ThreadState): CompactionHost {
  return {
    sessionKey: thread.descriptor.sessionKey,
    chatRunId: thread.chatRunId,
    chatStream: thread.chatStream,
    chatStreamReasoning: thread.chatStreamReasoning,
    chatStreamStartedAt: thread.chatStreamStartedAt,
    compactionStatus: thread.compactionStatus,
    compactionClearTimer: thread.compactionClearTimer,
    toolStreamById: thread.toolStreamById,
    toolStreamOrder: thread.toolStreamOrder,
    chatToolMessages: thread.chatToolMessages as Record<string, unknown>[],
    toolStreamSyncTimer: thread.toolStreamSyncTimer,
  };
}

/** Write back any scalar fields that the adapter may have replaced. */
function syncBackFromHost(thread: ThreadState, host: CompactionHost) {
  thread.chatRunId = host.chatRunId;
  thread.chatStream = host.chatStream;
  thread.chatStreamReasoning = host.chatStreamReasoning;
  thread.chatStreamStartedAt = host.chatStreamStartedAt;
  thread.compactionStatus = host.compactionStatus ?? null;
  thread.compactionClearTimer = host.compactionClearTimer ?? null;
  thread.chatToolMessages = host.chatToolMessages;
  thread.toolStreamSyncTimer = host.toolStreamSyncTimer;
}

/** Reset tool stream state for a specific thread. */
export function resetToolStreamForThread(thread: ThreadState) {
  thread.toolStreamById.clear();
  thread.toolStreamOrder = [];
  thread.chatToolMessages = [];
  if (thread.toolStreamSyncTimer != null) {
    clearTimeout(thread.toolStreamSyncTimer);
    thread.toolStreamSyncTimer = null;
  }
}

/** Handle an agent event for a non-focused thread's tool stream. */
export function handleAgentEventForThread(thread: ThreadState, payload?: AgentEventPayload) {
  if (!payload) {
    return;
  }

  const isCompaction = payload.stream === "compaction";
  if (
    !isCompaction &&
    payload.stream !== "tool" &&
    payload.stream !== "thinking" &&
    payload.stream !== "reasoning"
  ) {
    return;
  }
  const host = threadAsToolStreamHost(thread);
  const sessionKey = typeof payload.sessionKey === "string" ? payload.sessionKey : undefined;
  // Only accept events for this thread's session (or session-less for active run)
  if (sessionKey && !sessionKeysMatch(sessionKey, thread.descriptor.sessionKey)) {
    return;
  }

  if (isCompaction) {
    if (!sessionKey) {
      // Session-less compaction events are ambiguous; only accept when this
      // thread already owns the run.
      if (!host.chatRunId || payload.runId !== host.chatRunId) {
        return;
      }
    } else if (host.chatRunId && payload.runId !== host.chatRunId) {
      return;
    }
    handleCompactionEvent(host, payload);
    syncBackFromHost(thread, host);
    return;
  }

  if (!sessionKey && host.chatRunId && payload.runId !== host.chatRunId) {
    return;
  }
  if (host.chatRunId && payload.runId !== host.chatRunId) {
    return;
  }
  if (!host.chatRunId) {
    host.chatRunId = payload.runId;
    if (host.chatStream == null) {
      host.chatStream = "";
    }
    if (!host.chatStreamStartedAt) {
      host.chatStreamStartedAt = typeof payload.ts === "number" ? payload.ts : Date.now();
    }
  }

  if (payload.stream === "thinking" || payload.stream === "reasoning") {
    void applyThinkingStream(host, payload);
    syncBackFromHost(thread, host);
    return;
  }

  const data = payload.data ?? {};
  const toolCallId = typeof data.toolCallId === "string" ? data.toolCallId : "";
  if (!toolCallId) {
    return;
  }
  const name = typeof data.name === "string" ? data.name : "tool";
  const phase = typeof data.phase === "string" ? data.phase : "";
  const args = phase === "start" ? data.args : undefined;
  const output =
    phase === "update"
      ? (formatToolOutput(data.partialResult) ?? undefined)
      : phase === "result"
        ? (formatToolOutput(data.result) ?? undefined)
        : undefined;

  applyToolEvent(host, {
    toolCallId,
    runId: payload.runId,
    sessionKey,
    name,
    args,
    output,
    ts: payload.ts,
    phase,
  });
  flushToolStreamSync(host);
  syncBackFromHost(thread, host);
}
