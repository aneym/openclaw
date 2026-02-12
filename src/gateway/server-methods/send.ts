import { createHash } from "node:crypto";
import type { GatewayRequestContext, GatewayRequestHandlers } from "./types.js";
import { resolveSessionAgentId } from "../../agents/agent-scope.js";
import { getChannelPlugin, normalizeChannelId } from "../../channels/plugins/index.js";
import { DEFAULT_CHAT_CHANNEL } from "../../channels/registry.js";
import { createOutboundSendDeps } from "../../cli/deps.js";
import { loadConfig } from "../../config/config.js";
import { isDiagnosticFlagEnabled } from "../../infra/diagnostic-flags.js";
import { deliverOutboundPayloads } from "../../infra/outbound/deliver.js";
import {
  ensureOutboundSessionEntry,
  resolveOutboundSessionRoute,
} from "../../infra/outbound/outbound-session.js";
import { normalizeReplyPayloadsForDelivery } from "../../infra/outbound/payloads.js";
import { resolveOutboundTarget } from "../../infra/outbound/targets.js";
import { normalizePollInput } from "../../polls.js";
import {
  ErrorCodes,
  errorShape,
  formatValidationErrors,
  validatePollParams,
  validateSendParams,
} from "../protocol/index.js";
import { formatForLog } from "../ws-log.js";

type InflightResult = {
  ok: boolean;
  payload?: Record<string, unknown>;
  error?: ReturnType<typeof errorShape>;
  meta?: Record<string, unknown>;
};

type OutboundTraceStatus = "ok" | "error";

type OutboundTraceMethod = "send" | "poll";

type TargetQueueMeta = {
  key: string;
  waitMs: number;
  depthAtEnqueue: number;
  sequence: number;
};

type OutboundTraceEntry = {
  id: number;
  method: OutboundTraceMethod;
  idempotencyKey: string;
  channel: string;
  accountId?: string;
  to: string;
  status: OutboundTraceStatus;
  startedAt: number;
  finishedAt: number;
  durationMs: number;
  targetQueue?: TargetQueueMeta;
  messageId?: string;
  pollId?: string;
  mirrorSessionKey?: string;
  error?: string;
};

const OUTBOUND_TRACE_MAX_ITEMS = 500;
const OUTBOUND_TRACE_DEFAULT_LIMIT = 50;
const OUTBOUND_TRACE_MAX_LIMIT = 200;

const inflightByContext = new WeakMap<
  GatewayRequestContext,
  Map<string, Promise<InflightResult>>
>();
const outboundQueueByContext = new WeakMap<GatewayRequestContext, Map<string, Promise<void>>>();
const outboundQueueDepthByContext = new WeakMap<GatewayRequestContext, Map<string, number>>();
const outboundSequenceByContext = new WeakMap<GatewayRequestContext, Map<string, number>>();
const outboundTraceByContext = new WeakMap<
  GatewayRequestContext,
  { nextId: number; items: OutboundTraceEntry[] }
>();

const getInflightMap = (context: GatewayRequestContext) => {
  let inflight = inflightByContext.get(context);
  if (!inflight) {
    inflight = new Map();
    inflightByContext.set(context, inflight);
  }
  return inflight;
};

const getOutboundQueueMap = (context: GatewayRequestContext) => {
  let queue = outboundQueueByContext.get(context);
  if (!queue) {
    queue = new Map();
    outboundQueueByContext.set(context, queue);
  }
  return queue;
};

const getOutboundQueueDepthMap = (context: GatewayRequestContext) => {
  let depth = outboundQueueDepthByContext.get(context);
  if (!depth) {
    depth = new Map();
    outboundQueueDepthByContext.set(context, depth);
  }
  return depth;
};

const getOutboundSequenceMap = (context: GatewayRequestContext) => {
  let seq = outboundSequenceByContext.get(context);
  if (!seq) {
    seq = new Map();
    outboundSequenceByContext.set(context, seq);
  }
  return seq;
};

const getOutboundTraceState = (context: GatewayRequestContext) => {
  let state = outboundTraceByContext.get(context);
  if (!state) {
    state = { nextId: 1, items: [] };
    outboundTraceByContext.set(context, state);
  }
  return state;
};

function recordOutboundTrace(
  context: GatewayRequestContext,
  entry: Omit<OutboundTraceEntry, "id">,
): OutboundTraceEntry {
  const state = getOutboundTraceState(context);
  const next: OutboundTraceEntry = {
    id: state.nextId++,
    ...entry,
  };
  state.items.push(next);
  if (state.items.length > OUTBOUND_TRACE_MAX_ITEMS) {
    state.items.splice(0, state.items.length - OUTBOUND_TRACE_MAX_ITEMS);
  }
  return next;
}

function listOutboundTrace(
  context: GatewayRequestContext,
  params: {
    limit?: number;
    channel?: string;
    to?: string;
    accountId?: string;
    idempotencyKey?: string;
    status?: OutboundTraceStatus;
  },
): OutboundTraceEntry[] {
  const state = getOutboundTraceState(context);
  let entries = state.items;
  if (params.channel) {
    entries = entries.filter((entry) => entry.channel === params.channel);
  }
  if (params.to) {
    entries = entries.filter((entry) => entry.to === params.to);
  }
  if (params.accountId) {
    entries = entries.filter((entry) => entry.accountId === params.accountId);
  }
  if (params.idempotencyKey) {
    entries = entries.filter((entry) => entry.idempotencyKey === params.idempotencyKey);
  }
  if (params.status) {
    entries = entries.filter((entry) => entry.status === params.status);
  }
  const requested =
    typeof params.limit === "number" && Number.isFinite(params.limit)
      ? Math.floor(params.limit)
      : OUTBOUND_TRACE_DEFAULT_LIMIT;
  const limit = Math.max(1, Math.min(OUTBOUND_TRACE_MAX_LIMIT, requested));
  if (entries.length <= limit) {
    return entries.slice();
  }
  return entries.slice(-limit);
}

function buildOutboundTargetQueueKey(params: {
  channel: string;
  accountId?: string;
  to: string;
}): string {
  return [params.channel, params.accountId ?? "default", params.to].join("|");
}

function hashQueueKey(value: string): string {
  return createHash("sha1").update(value).digest("hex").slice(0, 12);
}

async function runSerializedByTarget<T>(params: {
  context: GatewayRequestContext;
  targetKey: string;
  run: () => Promise<T>;
}): Promise<{
  value: T;
  waitMs: number;
  depthAtEnqueue: number;
  sequence: number;
}> {
  const queueMap = getOutboundQueueMap(params.context);
  const depthMap = getOutboundQueueDepthMap(params.context);
  const sequenceMap = getOutboundSequenceMap(params.context);

  const previous = queueMap.get(params.targetKey) ?? Promise.resolve();
  const depthAtEnqueue = (depthMap.get(params.targetKey) ?? 0) + 1;
  depthMap.set(params.targetKey, depthAtEnqueue);

  let release: (() => void) | null = null;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queued = previous.then(
    () => gate,
    () => gate,
  );
  queueMap.set(params.targetKey, queued);

  const queuedAt = Date.now();
  try {
    await previous;
    const waitMs = Date.now() - queuedAt;
    const sequence = (sequenceMap.get(params.targetKey) ?? 0) + 1;
    sequenceMap.set(params.targetKey, sequence);
    const value = await params.run();
    return { value, waitMs, depthAtEnqueue, sequence };
  } finally {
    release?.();
    const nextDepth = Math.max(0, (depthMap.get(params.targetKey) ?? 1) - 1);
    if (nextDepth === 0) {
      depthMap.delete(params.targetKey);
    } else {
      depthMap.set(params.targetKey, nextDepth);
    }
    if (queueMap.get(params.targetKey) === queued) {
      queueMap.delete(params.targetKey);
    }
  }
}

export const sendHandlers: GatewayRequestHandlers = {
  "send.trace": ({ params, respond, context }) => {
    const p = params;
    const limit = p.limit;
    if (limit !== undefined && (typeof limit !== "number" || !Number.isFinite(limit))) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "limit must be a number"));
      return;
    }
    const normalizeString = (value: unknown): string | undefined => {
      if (typeof value !== "string") {
        return undefined;
      }
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    };
    const channelInput = normalizeString(p.channel);
    const normalizedChannel = channelInput ? normalizeChannelId(channelInput) : undefined;
    if (channelInput && !normalizedChannel) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `unsupported channel: ${channelInput}`),
      );
      return;
    }
    const statusInput = normalizeString(p.status);
    if (statusInput && statusInput !== "ok" && statusInput !== "error") {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "status must be ok|error"));
      return;
    }
    const entries = listOutboundTrace(context, {
      limit: typeof limit === "number" ? limit : undefined,
      channel: normalizedChannel,
      to: normalizeString(p.to),
      accountId: normalizeString(p.accountId),
      idempotencyKey: normalizeString(p.idempotencyKey),
      status: statusInput as OutboundTraceStatus | undefined,
    });
    respond(
      true,
      {
        ts: Date.now(),
        totalBuffered: getOutboundTraceState(context).items.length,
        entries,
      },
      undefined,
    );
  },
  send: async ({ params, respond, context }) => {
    const p = params;
    if (!validateSendParams(p)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid send params: ${formatValidationErrors(validateSendParams.errors)}`,
        ),
      );
      return;
    }
    const request = p as {
      to: string;
      message?: string;
      mediaUrl?: string;
      mediaUrls?: string[];
      gifPlayback?: boolean;
      channel?: string;
      accountId?: string;
      sessionKey?: string;
      idempotencyKey: string;
    };
    const idem = request.idempotencyKey;
    const dedupeKey = `send:${idem}`;
    const cached = context.dedupe.get(dedupeKey);
    if (cached) {
      respond(cached.ok, cached.payload, cached.error, {
        cached: true,
      });
      return;
    }
    const inflightMap = getInflightMap(context);
    const inflight = inflightMap.get(dedupeKey);
    if (inflight) {
      const result = await inflight;
      const meta = result.meta ? { ...result.meta, cached: true } : { cached: true };
      respond(result.ok, result.payload, result.error, meta);
      return;
    }
    const to = request.to.trim();
    const message = typeof request.message === "string" ? request.message.trim() : "";
    const mediaUrl =
      typeof request.mediaUrl === "string" && request.mediaUrl.trim().length > 0
        ? request.mediaUrl.trim()
        : undefined;
    const mediaUrls = Array.isArray(request.mediaUrls)
      ? request.mediaUrls
          .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
          .filter((entry) => entry.length > 0)
      : undefined;
    if (!message && !mediaUrl && (mediaUrls?.length ?? 0) === 0) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "invalid send params: text or media is required"),
      );
      return;
    }
    const channelInput = typeof request.channel === "string" ? request.channel : undefined;
    const normalizedChannel = channelInput ? normalizeChannelId(channelInput) : null;
    if (channelInput && !normalizedChannel) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `unsupported channel: ${channelInput}`),
      );
      return;
    }
    const channel = normalizedChannel ?? DEFAULT_CHAT_CHANNEL;
    const accountId =
      typeof request.accountId === "string" && request.accountId.trim().length
        ? request.accountId.trim()
        : undefined;
    const outboundChannel = channel;
    const plugin = getChannelPlugin(channel);
    if (!plugin) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `unsupported channel: ${channel}`),
      );
      return;
    }

    const work = (async (): Promise<InflightResult> => {
      const startedAt = Date.now();
      try {
        const cfg = loadConfig();
        const orderingDiagnostics =
          isDiagnosticFlagEnabled("gateway.send-order", cfg) ||
          isDiagnosticFlagEnabled("gateway.outbound-order", cfg);
        const resolved = resolveOutboundTarget({
          channel: outboundChannel,
          to,
          cfg,
          accountId,
          mode: "explicit",
        });
        if (!resolved.ok) {
          const finishedAt = Date.now();
          recordOutboundTrace(context, {
            method: "send",
            idempotencyKey: idem,
            channel: outboundChannel,
            accountId,
            to,
            status: "error",
            startedAt,
            finishedAt,
            durationMs: finishedAt - startedAt,
            error: String(resolved.error),
          });
          return {
            ok: false,
            error: errorShape(ErrorCodes.INVALID_REQUEST, String(resolved.error)),
            meta: { channel },
          };
        }
        const targetQueueKey = buildOutboundTargetQueueKey({
          channel: outboundChannel,
          accountId,
          to: resolved.to,
        });
        const targetHash = hashQueueKey(targetQueueKey);
        const serialized = await runSerializedByTarget({
          context,
          targetKey: targetQueueKey,
          run: async () => {
            const outboundDeps = context.deps ? createOutboundSendDeps(context.deps) : undefined;
            const mirrorPayloads = normalizeReplyPayloadsForDelivery([
              { text: message, mediaUrl, mediaUrls },
            ]);
            const mirrorText = mirrorPayloads
              .map((payload) => payload.text)
              .filter(Boolean)
              .join("\n");
            const mirrorMediaUrls = mirrorPayloads.flatMap(
              (payload) => payload.mediaUrls ?? (payload.mediaUrl ? [payload.mediaUrl] : []),
            );
            const providedSessionKey =
              typeof request.sessionKey === "string" && request.sessionKey.trim()
                ? request.sessionKey.trim().toLowerCase()
                : undefined;
            const derivedAgentId = resolveSessionAgentId({ config: cfg });
            // If callers omit sessionKey, derive a target session key from the outbound route.
            const derivedRoute = !providedSessionKey
              ? await resolveOutboundSessionRoute({
                  cfg,
                  channel,
                  agentId: derivedAgentId,
                  accountId,
                  target: resolved.to,
                })
              : null;
            if (derivedRoute) {
              await ensureOutboundSessionEntry({
                cfg,
                agentId: derivedAgentId,
                channel,
                accountId,
                route: derivedRoute,
              });
            }
            const results = await deliverOutboundPayloads({
              cfg,
              channel: outboundChannel,
              to: resolved.to,
              accountId,
              payloads: [{ text: message, mediaUrl, mediaUrls }],
              gifPlayback: request.gifPlayback,
              deps: outboundDeps,
              mirror: providedSessionKey
                ? {
                    sessionKey: providedSessionKey,
                    agentId: resolveSessionAgentId({ sessionKey: providedSessionKey, config: cfg }),
                    text: mirrorText || message,
                    mediaUrls: mirrorMediaUrls.length > 0 ? mirrorMediaUrls : undefined,
                  }
                : derivedRoute
                  ? {
                      sessionKey: derivedRoute.sessionKey,
                      agentId: derivedAgentId,
                      text: mirrorText || message,
                      mediaUrls: mirrorMediaUrls.length > 0 ? mirrorMediaUrls : undefined,
                    }
                  : undefined,
            });

            const result = results.at(-1);
            if (!result) {
              throw new Error("No delivery result");
            }
            const payload: Record<string, unknown> = {
              runId: idem,
              messageId: result.messageId,
              channel,
            };
            if ("chatId" in result) {
              payload.chatId = result.chatId;
            }
            if ("channelId" in result) {
              payload.channelId = result.channelId;
            }
            if ("toJid" in result) {
              payload.toJid = result.toJid;
            }
            if ("conversationId" in result) {
              payload.conversationId = result.conversationId;
            }
            return {
              payload,
              mirrorSessionKey: providedSessionKey ?? derivedRoute?.sessionKey,
            };
          },
        });

        if (orderingDiagnostics) {
          context.logGateway.info(
            [
              "send order",
              `channel=${outboundChannel}`,
              `account=${accountId ?? "default"}`,
              `target=${targetHash}`,
              `waitMs=${serialized.waitMs}`,
              `depth=${serialized.depthAtEnqueue}`,
              `seq=${serialized.sequence}`,
              `idem=${idem}`,
            ].join(" "),
          );
        }

        const payload = {
          ...serialized.value.payload,
          _targetQueue: {
            key: targetHash,
            waitMs: serialized.waitMs,
            depthAtEnqueue: serialized.depthAtEnqueue,
            sequence: serialized.sequence,
          },
        };
        const finishedAt = Date.now();
        recordOutboundTrace(context, {
          method: "send",
          idempotencyKey: idem,
          channel: outboundChannel,
          accountId,
          to: resolved.to,
          status: "ok",
          startedAt,
          finishedAt,
          durationMs: finishedAt - startedAt,
          targetQueue: {
            key: targetHash,
            waitMs: serialized.waitMs,
            depthAtEnqueue: serialized.depthAtEnqueue,
            sequence: serialized.sequence,
          },
          messageId:
            typeof payload.messageId === "string"
              ? payload.messageId
              : payload.messageId != null
                ? String(payload.messageId)
                : undefined,
          mirrorSessionKey: serialized.value.mirrorSessionKey,
        });
        context.dedupe.set(dedupeKey, {
          ts: Date.now(),
          ok: true,
          payload,
        });
        return {
          ok: true,
          payload,
          meta: {
            channel,
            targetQueueWaitMs: serialized.waitMs,
            targetQueueSequence: serialized.sequence,
            targetQueueDepthAtEnqueue: serialized.depthAtEnqueue,
          },
        };
      } catch (err) {
        const finishedAt = Date.now();
        if (to) {
          recordOutboundTrace(context, {
            method: "send",
            idempotencyKey: idem,
            channel: outboundChannel,
            accountId,
            to,
            status: "error",
            startedAt,
            finishedAt,
            durationMs: finishedAt - startedAt,
            error: formatForLog(err),
          });
        }
        const error = errorShape(ErrorCodes.UNAVAILABLE, String(err));
        context.dedupe.set(dedupeKey, {
          ts: Date.now(),
          ok: false,
          error,
        });
        return { ok: false, error, meta: { channel, error: formatForLog(err) } };
      }
    })();

    inflightMap.set(dedupeKey, work);
    try {
      const result = await work;
      respond(result.ok, result.payload, result.error, result.meta);
    } finally {
      inflightMap.delete(dedupeKey);
    }
  },
  poll: async ({ params, respond, context }) => {
    const p = params;
    if (!validatePollParams(p)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid poll params: ${formatValidationErrors(validatePollParams.errors)}`,
        ),
      );
      return;
    }
    const request = p as {
      to: string;
      question: string;
      options: string[];
      maxSelections?: number;
      durationHours?: number;
      channel?: string;
      accountId?: string;
      idempotencyKey: string;
    };
    const idem = request.idempotencyKey;
    const cached = context.dedupe.get(`poll:${idem}`);
    if (cached) {
      respond(cached.ok, cached.payload, cached.error, {
        cached: true,
      });
      return;
    }
    const to = request.to.trim();
    const channelInput = typeof request.channel === "string" ? request.channel : undefined;
    const normalizedChannel = channelInput ? normalizeChannelId(channelInput) : null;
    if (channelInput && !normalizedChannel) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `unsupported poll channel: ${channelInput}`),
      );
      return;
    }
    const channel = normalizedChannel ?? DEFAULT_CHAT_CHANNEL;
    const poll = {
      question: request.question,
      options: request.options,
      maxSelections: request.maxSelections,
      durationHours: request.durationHours,
    };
    const accountId =
      typeof request.accountId === "string" && request.accountId.trim().length
        ? request.accountId.trim()
        : undefined;
    const startedAt = Date.now();
    try {
      const plugin = getChannelPlugin(channel);
      const outbound = plugin?.outbound;
      if (!outbound?.sendPoll) {
        const finishedAt = Date.now();
        recordOutboundTrace(context, {
          method: "poll",
          idempotencyKey: idem,
          channel,
          accountId,
          to,
          status: "error",
          startedAt,
          finishedAt,
          durationMs: finishedAt - startedAt,
          error: `unsupported poll channel: ${channel}`,
        });
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, `unsupported poll channel: ${channel}`),
        );
        return;
      }
      const cfg = loadConfig();
      const resolved = resolveOutboundTarget({
        channel: channel,
        to,
        cfg,
        accountId,
        mode: "explicit",
      });
      if (!resolved.ok) {
        const finishedAt = Date.now();
        recordOutboundTrace(context, {
          method: "poll",
          idempotencyKey: idem,
          channel,
          accountId,
          to,
          status: "error",
          startedAt,
          finishedAt,
          durationMs: finishedAt - startedAt,
          error: String(resolved.error),
        });
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, String(resolved.error)));
        return;
      }
      const targetQueueKey = buildOutboundTargetQueueKey({
        channel,
        accountId,
        to: resolved.to,
      });
      const targetHash = hashQueueKey(targetQueueKey);
      const normalized = outbound.pollMaxOptions
        ? normalizePollInput(poll, { maxOptions: outbound.pollMaxOptions })
        : normalizePollInput(poll);
      const serialized = await runSerializedByTarget({
        context,
        targetKey: targetQueueKey,
        run: async () =>
          await outbound.sendPoll({
            cfg,
            to: resolved.to,
            poll: normalized,
            accountId,
          }),
      });
      const result = serialized.value;
      const payload: Record<string, unknown> = {
        runId: idem,
        messageId: result.messageId,
        channel,
        _targetQueue: {
          key: targetHash,
          waitMs: serialized.waitMs,
          depthAtEnqueue: serialized.depthAtEnqueue,
          sequence: serialized.sequence,
        },
      };
      if (result.toJid) {
        payload.toJid = result.toJid;
      }
      if (result.channelId) {
        payload.channelId = result.channelId;
      }
      if (result.conversationId) {
        payload.conversationId = result.conversationId;
      }
      if (result.pollId) {
        payload.pollId = result.pollId;
      }
      const finishedAt = Date.now();
      recordOutboundTrace(context, {
        method: "poll",
        idempotencyKey: idem,
        channel,
        accountId,
        to: resolved.to,
        status: "ok",
        startedAt,
        finishedAt,
        durationMs: finishedAt - startedAt,
        targetQueue: {
          key: targetHash,
          waitMs: serialized.waitMs,
          depthAtEnqueue: serialized.depthAtEnqueue,
          sequence: serialized.sequence,
        },
        messageId: typeof result.messageId === "string" ? result.messageId : undefined,
        pollId: typeof result.pollId === "string" ? result.pollId : undefined,
      });
      context.dedupe.set(`poll:${idem}`, {
        ts: Date.now(),
        ok: true,
        payload,
      });
      respond(true, payload, undefined, {
        channel,
        targetQueueWaitMs: serialized.waitMs,
        targetQueueSequence: serialized.sequence,
        targetQueueDepthAtEnqueue: serialized.depthAtEnqueue,
      });
    } catch (err) {
      const finishedAt = Date.now();
      if (to) {
        recordOutboundTrace(context, {
          method: "poll",
          idempotencyKey: idem,
          channel,
          accountId,
          to,
          status: "error",
          startedAt,
          finishedAt,
          durationMs: finishedAt - startedAt,
          error: formatForLog(err),
        });
      }
      const error = errorShape(ErrorCodes.UNAVAILABLE, String(err));
      context.dedupe.set(`poll:${idem}`, {
        ts: Date.now(),
        ok: false,
        error,
      });
      respond(false, undefined, error, {
        channel,
        error: formatForLog(err),
      });
    }
  },
};
