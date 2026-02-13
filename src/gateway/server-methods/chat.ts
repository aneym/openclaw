import { CURRENT_SESSION_VERSION, SessionManager } from "@mariozechner/pi-coding-agent";
import fs from "node:fs";
import path from "node:path";
import type { MsgContext } from "../../auto-reply/templating.js";
import type { GatewayRequestContext, GatewayRequestHandlers } from "./types.js";
import { resolveSessionAgentId } from "../../agents/agent-scope.js";
import { resolveThinkingDefault } from "../../agents/model-selection.js";
import { resolveAgentTimeoutMs } from "../../agents/timeout.js";
import { dispatchInboundMessage } from "../../auto-reply/dispatch.js";
import { createReplyDispatcher } from "../../auto-reply/reply/reply-dispatcher.js";
import { createReplyPrefixOptions } from "../../channels/reply-prefix.js";
import { loadConfig } from "../../config/config.js";
import { resolveSendPolicy } from "../../sessions/send-policy.js";
import { INTERNAL_MESSAGE_CHANNEL } from "../../utils/message-channel.js";
import {
  abortChatRunById,
  abortChatRunsForSessionKey,
  isChatStopCommandText,
  resolveChatRunExpiresAtMs,
} from "../chat-abort.js";
import { type ChatImageContent, parseMessageWithAttachments } from "../chat-attachments.js";
import { stripEnvelopeFromMessages } from "../chat-sanitize.js";
import { GATEWAY_CLIENT_CAPS, hasGatewayClientCap } from "../protocol/client-info.js";
import {
  ErrorCodes,
  errorShape,
  formatValidationErrors,
  validateChatAbortParams,
  validateChatHistoryParams,
  validateChatInjectParams,
  validateChatSendParams,
  validateChatStatusManyParams,
  validateChatStatusParams,
} from "../protocol/index.js";
import { getMaxChatHistoryMessagesBytes } from "../server-constants.js";
import {
  capArrayByJsonBytes,
  loadSessionEntry,
  readSessionMessages,
  resolveSessionStoreKey,
  resolveSessionModelRef,
} from "../session-utils.js";
import { formatForLog } from "../ws-log.js";
import { injectTimestamp, timestampOptsFromConfig } from "./agent-timestamp.js";

type TranscriptAppendResult = {
  ok: boolean;
  messageId?: string;
  message?: Record<string, unknown>;
  error?: string;
};

type AppendMessageArg = Parameters<SessionManager["appendMessage"]>[0];

function resolveTranscriptPath(params: {
  sessionId: string;
  storePath: string | undefined;
  sessionFile?: string;
}): string | null {
  const { sessionId, storePath, sessionFile } = params;
  if (sessionFile) {
    return sessionFile;
  }
  if (!storePath) {
    return null;
  }
  return path.join(path.dirname(storePath), `${sessionId}.jsonl`);
}

function ensureTranscriptFile(params: { transcriptPath: string; sessionId: string }): {
  ok: boolean;
  error?: string;
} {
  if (fs.existsSync(params.transcriptPath)) {
    return { ok: true };
  }
  try {
    fs.mkdirSync(path.dirname(params.transcriptPath), { recursive: true });
    const header = {
      type: "session",
      version: CURRENT_SESSION_VERSION,
      id: params.sessionId,
      timestamp: new Date().toISOString(),
      cwd: process.cwd(),
    };
    fs.writeFileSync(params.transcriptPath, `${JSON.stringify(header)}\n`, "utf-8");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function appendAssistantTranscriptMessage(params: {
  message: string;
  label?: string;
  sessionId: string;
  storePath: string | undefined;
  sessionFile?: string;
  createIfMissing?: boolean;
}): TranscriptAppendResult {
  const transcriptPath = resolveTranscriptPath({
    sessionId: params.sessionId,
    storePath: params.storePath,
    sessionFile: params.sessionFile,
  });
  if (!transcriptPath) {
    return { ok: false, error: "transcript path not resolved" };
  }

  if (!fs.existsSync(transcriptPath)) {
    if (!params.createIfMissing) {
      return { ok: false, error: "transcript file not found" };
    }
    const ensured = ensureTranscriptFile({
      transcriptPath,
      sessionId: params.sessionId,
    });
    if (!ensured.ok) {
      return { ok: false, error: ensured.error ?? "failed to create transcript file" };
    }
  }

  const now = Date.now();
  const labelPrefix = params.label ? `[${params.label}]\n\n` : "";
  const usage = {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      total: 0,
    },
  };
  const messageBody: AppendMessageArg & Record<string, unknown> = {
    role: "assistant",
    content: [{ type: "text", text: `${labelPrefix}${params.message}` }],
    timestamp: now,
    // Pi stopReason is a strict enum; this is not model output, but we still store it as a
    // normal assistant message so it participates in the session parentId chain.
    stopReason: "stop",
    usage,
    // Make these explicit so downstream tooling never treats this as model output.
    api: "openai-responses",
    provider: "openclaw",
    model: "gateway-injected",
  };

  try {
    // IMPORTANT: Use SessionManager so the entry is attached to the current leaf via parentId.
    // Raw jsonl appends break the parent chain and can hide compaction summaries from context.
    const sessionManager = SessionManager.open(transcriptPath);
    const messageId = sessionManager.appendMessage(messageBody);
    return { ok: true, messageId, message: messageBody };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function nextChatSeq(context: { agentRunSeq: Map<string, number> }, runId: string) {
  const next = (context.agentRunSeq.get(runId) ?? 0) + 1;
  context.agentRunSeq.set(runId, next);
  return next;
}

function resolveCanonicalChatSessionKey(rawSessionKey: string): string {
  const raw = rawSessionKey.trim();
  if (!raw) {
    return raw;
  }
  const cfg = loadConfig();
  return resolveSessionStoreKey({ cfg, sessionKey: raw });
}

function broadcastChatFinal(params: {
  context: Pick<GatewayRequestContext, "broadcast" | "nodeSendToSession" | "agentRunSeq">;
  runId: string;
  sessionKey: string;
  message?: Record<string, unknown>;
}) {
  const seq = nextChatSeq({ agentRunSeq: params.context.agentRunSeq }, params.runId);
  const updatedAtMs = Date.now();
  const payload = {
    runId: params.runId,
    sourceRunId: params.runId,
    sessionKey: params.sessionKey,
    seq,
    updatedAtMs,
    state: "final" as const,
    message: params.message,
  };
  params.context.broadcast("chat", payload);
  params.context.nodeSendToSession(params.sessionKey, "chat", payload);
}

function broadcastChatError(params: {
  context: Pick<GatewayRequestContext, "broadcast" | "nodeSendToSession" | "agentRunSeq">;
  runId: string;
  sessionKey: string;
  errorMessage?: string;
}) {
  const seq = nextChatSeq({ agentRunSeq: params.context.agentRunSeq }, params.runId);
  const updatedAtMs = Date.now();
  const payload = {
    runId: params.runId,
    sourceRunId: params.runId,
    sessionKey: params.sessionKey,
    seq,
    updatedAtMs,
    state: "error" as const,
    errorMessage: params.errorMessage,
  };
  params.context.broadcast("chat", payload);
  params.context.nodeSendToSession(params.sessionKey, "chat", payload);
}

function resolveActiveRunForSession(
  context: Pick<GatewayRequestContext, "chatAbortControllers" | "chatRunBuffers">,
  sessionKey: string,
) {
  for (const [runId, entry] of context.chatAbortControllers) {
    if (entry.sessionKey !== sessionKey) {
      continue;
    }
    return {
      runId,
      streamText: context.chatRunBuffers.get(runId) ?? null,
    };
  }
  return null;
}

type TranscriptMessageLike = {
  role?: unknown;
  content?: unknown;
};

function extractTextFromTranscriptMessage(message: unknown): string | null {
  if (!message || typeof message !== "object") {
    return null;
  }
  const content = (message as TranscriptMessageLike).content;
  if (typeof content === "string") {
    const trimmed = content.trim();
    return trimmed ? trimmed : null;
  }
  if (!Array.isArray(content)) {
    return null;
  }
  for (const part of content) {
    if (!part || typeof part !== "object") {
      continue;
    }
    const type = (part as { type?: unknown }).type;
    const text = (part as { text?: unknown }).text;
    if (
      typeof text === "string" &&
      (type === "text" || type === "input_text" || type === "output_text")
    ) {
      const trimmed = text.trim();
      if (trimmed) {
        return trimmed;
      }
    }
  }
  return null;
}

function transcriptHasPendingUserMessage(history: unknown[], pending: Record<string, unknown>) {
  if (!pending || pending.role !== "user") {
    return true;
  }
  const pendingText = extractTextFromTranscriptMessage(pending);
  if (!pendingText) {
    // Image-only messages are rare and transcript representation may differ.
    // Prefer showing the pending prompt rather than risking a false match.
    return false;
  }
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i] as TranscriptMessageLike | undefined;
    if (!msg || typeof msg !== "object") {
      continue;
    }
    if (msg.role !== "user") {
      continue;
    }
    const historyText = extractTextFromTranscriptMessage(msg);
    return historyText === pendingText;
  }
  return false;
}

function maybeRegisterToolEventRecipientForRun(params: {
  context: Pick<GatewayRequestContext, "registerToolEventRecipient">;
  client: { connId?: string; connect?: { caps?: string[] | null } } | null;
  runId: string | null | undefined;
}) {
  const runId = typeof params.runId === "string" ? params.runId : "";
  if (!runId) {
    return;
  }
  const connId = typeof params.client?.connId === "string" ? params.client.connId : "";
  if (!connId) {
    return;
  }
  const wantsToolEvents = hasGatewayClientCap(
    params.client?.connect?.caps,
    GATEWAY_CLIENT_CAPS.TOOL_EVENTS,
  );
  if (!wantsToolEvents) {
    return;
  }
  params.context.registerToolEventRecipient(runId, connId);
}

export const chatHandlers: GatewayRequestHandlers = {
  "chat.status": ({ params, respond, context, client }) => {
    if (!validateChatStatusParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid chat.status params: ${formatValidationErrors(validateChatStatusParams.errors)}`,
        ),
      );
      return;
    }
    const { sessionKey: rawSessionKey } = params as { sessionKey: string };
    const sessionKey = resolveCanonicalChatSessionKey(rawSessionKey);
    const activeRun = resolveActiveRunForSession(context, sessionKey);
    maybeRegisterToolEventRecipientForRun({
      context,
      client,
      runId: activeRun?.runId,
    });
    respond(true, { activeRun });
  },
  "chat.statusMany": ({ params, respond, context, client }) => {
    if (!validateChatStatusManyParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid chat.statusMany params: ${formatValidationErrors(validateChatStatusManyParams.errors)}`,
        ),
      );
      return;
    }
    const { sessionKeys } = params as { sessionKeys: string[] };
    const statuses = sessionKeys.map((sessionKey) => {
      const canonicalKey = resolveCanonicalChatSessionKey(sessionKey);
      const activeRun = resolveActiveRunForSession(context, canonicalKey);
      maybeRegisterToolEventRecipientForRun({
        context,
        client,
        runId: activeRun?.runId,
      });
      return {
        sessionKey: canonicalKey,
        activeRun,
      };
    });
    respond(true, { statuses });
  },
  "chat.history": async ({ params, respond, context }) => {
    if (!validateChatHistoryParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid chat.history params: ${formatValidationErrors(validateChatHistoryParams.errors)}`,
        ),
      );
      return;
    }
    const { sessionKey, limit } = params as {
      sessionKey: string;
      limit?: number;
    };
    const { cfg, storePath, entry, canonicalKey } = loadSessionEntry(sessionKey);
    const canonicalSessionKey = canonicalKey;
    const sessionId = entry?.sessionId;
    const hardMax = 1000;
    const defaultLimit = 200;
    const requested = typeof limit === "number" ? limit : defaultLimit;
    const max = Math.min(hardMax, requested);
    const rawMessages =
      sessionId && storePath
        ? readSessionMessages(sessionId, storePath, entry?.sessionFile, { tail: max })
        : [];
    const sliced = rawMessages.length > max ? rawMessages.slice(-max) : rawMessages;
    const sanitized = stripEnvelopeFromMessages(sliced);

    // Webchat refresh safety: if there's an in-flight run for this session, ensure
    // the outbound user message is present even if pi-coding-agent hasn't flushed
    // the transcript to disk yet (it waits until the first assistant message).
    const pendingUserMessages: Array<Record<string, unknown>> = [];
    for (const [, active] of context.chatAbortControllers) {
      if (active.sessionKey !== canonicalSessionKey) {
        continue;
      }
      const pending = active.pendingUserMessage;
      if (pending && typeof pending === "object") {
        pendingUserMessages.push(pending);
      }
    }
    pendingUserMessages.sort((a, b) => Number(a.timestamp ?? 0) - Number(b.timestamp ?? 0));

    const merged = [...sanitized];
    for (const pending of pendingUserMessages) {
      if (!transcriptHasPendingUserMessage(merged, pending)) {
        merged.push(pending);
      }
    }

    const capped = capArrayByJsonBytes(merged, getMaxChatHistoryMessagesBytes()).items;
    let thinkingLevel = entry?.thinkingLevel;
    if (!thinkingLevel) {
      const configured = cfg.agents?.defaults?.thinkingDefault;
      if (configured) {
        thinkingLevel = configured;
      } else {
        const sessionAgentId = resolveSessionAgentId({
          sessionKey: canonicalSessionKey,
          config: cfg,
        });
        const { provider, model } = resolveSessionModelRef(cfg, entry, sessionAgentId);
        const catalog = await context.loadGatewayModelCatalog();
        thinkingLevel = resolveThinkingDefault({
          cfg,
          provider,
          model,
          catalog,
        });
      }
    }
    const verboseLevel = entry?.verboseLevel ?? cfg.agents?.defaults?.verboseDefault;
    const reasoningLevel = entry?.reasoningLevel ?? cfg.agents?.defaults?.reasoningDefault ?? "off";
    respond(true, {
      sessionKey: canonicalSessionKey,
      sessionId,
      messages: capped,
      thinkingLevel,
      verboseLevel,
      reasoningLevel,
    });
  },
  "chat.abort": ({ params, respond, context }) => {
    if (!validateChatAbortParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid chat.abort params: ${formatValidationErrors(validateChatAbortParams.errors)}`,
        ),
      );
      return;
    }
    const { sessionKey: rawSessionKey, runId } = params as {
      sessionKey: string;
      runId?: string;
    };
    const sessionKey = resolveCanonicalChatSessionKey(rawSessionKey);

    const ops = {
      chatAbortControllers: context.chatAbortControllers,
      chatRunBuffers: context.chatRunBuffers,
      chatDeltaSentAt: context.chatDeltaSentAt,
      chatAbortedRuns: context.chatAbortedRuns,
      removeChatRun: context.removeChatRun,
      agentRunSeq: context.agentRunSeq,
      broadcast: context.broadcast,
      nodeSendToSession: context.nodeSendToSession,
    };

    if (!runId) {
      const res = abortChatRunsForSessionKey(ops, {
        sessionKey,
        stopReason: "rpc",
      });
      respond(true, { ok: true, aborted: res.aborted, runIds: res.runIds });
      return;
    }

    const active = context.chatAbortControllers.get(runId);
    if (!active) {
      // Client run IDs can drift after reconnect/provider remap. If a specific
      // runId is unknown, fall back to aborting any active run in the session.
      const res = abortChatRunsForSessionKey(ops, {
        sessionKey,
        stopReason: "rpc",
      });
      respond(true, { ok: true, aborted: res.aborted, runIds: res.runIds });
      return;
    }
    if (active.sessionKey !== sessionKey) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "runId does not match sessionKey"),
      );
      return;
    }

    const res = abortChatRunById(ops, {
      runId,
      sessionKey,
      stopReason: "rpc",
    });
    respond(true, {
      ok: true,
      aborted: res.aborted,
      runIds: res.aborted ? [runId] : [],
    });
  },
  "chat.send": async ({ params, respond, context, client }) => {
    if (!validateChatSendParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid chat.send params: ${formatValidationErrors(validateChatSendParams.errors)}`,
        ),
      );
      return;
    }
    const p = params as {
      sessionKey: string;
      message: string;
      thinking?: string;
      deliver?: boolean;
      attachments?: Array<{
        type?: string;
        mimeType?: string;
        fileName?: string;
        content?: unknown;
      }>;
      timeoutMs?: number;
      idempotencyKey: string;
    };
    const stopCommand = isChatStopCommandText(p.message);
    const normalizedAttachments =
      p.attachments
        ?.map((a) => ({
          type: typeof a?.type === "string" ? a.type : undefined,
          mimeType: typeof a?.mimeType === "string" ? a.mimeType : undefined,
          fileName: typeof a?.fileName === "string" ? a.fileName : undefined,
          content:
            typeof a?.content === "string"
              ? a.content
              : ArrayBuffer.isView(a?.content)
                ? Buffer.from(
                    a.content.buffer,
                    a.content.byteOffset,
                    a.content.byteLength,
                  ).toString("base64")
                : undefined,
        }))
        .filter((a) => a.content) ?? [];
    const rawMessage = p.message.trim();
    if (!rawMessage && normalizedAttachments.length === 0) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "message or attachment required"),
      );
      return;
    }
    let parsedMessage = p.message;
    let parsedImages: ChatImageContent[] = [];
    if (normalizedAttachments.length > 0) {
      try {
        const parsed = await parseMessageWithAttachments(p.message, normalizedAttachments, {
          maxBytes: 5_000_000,
          log: context.logGateway,
        });
        parsedMessage = parsed.message;
        parsedImages = parsed.images;
      } catch (err) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, String(err)));
        return;
      }
    }
    const rawSessionKey = p.sessionKey;
    const { cfg, entry, canonicalKey: sessionKey } = loadSessionEntry(rawSessionKey);
    const hasSessionReasoningOverride =
      typeof entry?.reasoningLevel === "string" && entry.reasoningLevel.trim().length > 0;
    const hasConfiguredReasoningDefault =
      typeof cfg.agents?.defaults?.reasoningDefault === "string" &&
      cfg.agents.defaults.reasoningDefault.trim().length > 0;
    // Webchat relies on live reasoning deltas for the thinking panel. When neither the
    // session nor config specifies reasoning behavior, default this chat.send turn to stream.
    const cfgForDispatch =
      hasSessionReasoningOverride || hasConfiguredReasoningDefault
        ? cfg
        : {
            ...cfg,
            agents: {
              ...cfg.agents,
              defaults: {
                ...cfg.agents?.defaults,
                reasoningDefault: "stream",
              },
            },
          };
    const timeoutMs = resolveAgentTimeoutMs({
      cfg,
      overrideMs: p.timeoutMs,
    });
    const now = Date.now();
    const clientRunId = p.idempotencyKey;

    const sendPolicy = resolveSendPolicy({
      cfg,
      entry,
      sessionKey,
      channel: entry?.channel,
      chatType: entry?.chatType,
    });
    if (sendPolicy === "deny") {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "send blocked by session policy"),
      );
      return;
    }

    if (stopCommand) {
      const res = abortChatRunsForSessionKey(
        {
          chatAbortControllers: context.chatAbortControllers,
          chatRunBuffers: context.chatRunBuffers,
          chatDeltaSentAt: context.chatDeltaSentAt,
          chatAbortedRuns: context.chatAbortedRuns,
          removeChatRun: context.removeChatRun,
          agentRunSeq: context.agentRunSeq,
          broadcast: context.broadcast,
          nodeSendToSession: context.nodeSendToSession,
        },
        { sessionKey, stopReason: "stop" },
      );
      respond(true, { ok: true, aborted: res.aborted, runIds: res.runIds });
      return;
    }

    const cached = context.dedupe.get(`chat:${clientRunId}`);
    if (cached) {
      respond(cached.ok, cached.payload, cached.error, {
        cached: true,
      });
      return;
    }

    const activeExisting = context.chatAbortControllers.get(clientRunId);
    if (activeExisting) {
      respond(true, { runId: clientRunId, status: "in_flight" as const }, undefined, {
        cached: true,
        runId: clientRunId,
      });
      return;
    }

    try {
      const abortController = new AbortController();
      const pendingUserMessage = (() => {
        const contentBlocks: Array<{ type: string; text?: string; source?: unknown }> = [];
        if (rawMessage) {
          contentBlocks.push({ type: "text", text: rawMessage });
        }
        for (const att of normalizedAttachments) {
          const mimeType = att.mimeType ?? "application/octet-stream";
          const b64 = att.content;
          if (!b64) {
            continue;
          }
          // Match the Web UI shape (data URL stored in `source.data`) so it renders identically.
          const dataUrl = `data:${mimeType};base64,${b64}`;
          contentBlocks.push({
            type: "image",
            source: { type: "base64", media_type: mimeType, data: dataUrl },
          });
        }
        return {
          role: "user",
          messageId: `client:${clientRunId}:user`,
          content: contentBlocks,
          timestamp: now,
          __openclaw: {
            kind: "pending_user",
            runId: clientRunId,
            createdAtMs: now,
          },
        } satisfies Record<string, unknown>;
      })();
      context.chatAbortControllers.set(clientRunId, {
        controller: abortController,
        sessionId: entry?.sessionId ?? clientRunId,
        sessionKey,
        startedAtMs: now,
        expiresAtMs: resolveChatRunExpiresAtMs({ now, timeoutMs }),
        pendingUserMessage,
      });
      const ackPayload = {
        runId: clientRunId,
        status: "started" as const,
      };
      respond(true, ackPayload, undefined, { runId: clientRunId });

      const trimmedMessage = parsedMessage.trim();
      const injectThinking = Boolean(
        p.thinking && trimmedMessage && !trimmedMessage.startsWith("/"),
      );
      const commandBody = injectThinking ? `/think ${p.thinking} ${parsedMessage}` : parsedMessage;
      const clientInfo = client?.connect?.client;
      // Inject timestamp so agents know the current date/time.
      // Only BodyForAgent gets the timestamp — Body stays raw for UI display.
      // See: https://github.com/moltbot/moltbot/issues/3658
      const stampedMessage = injectTimestamp(parsedMessage, timestampOptsFromConfig(cfg));

      const ctx: MsgContext = {
        Body: parsedMessage,
        BodyForAgent: stampedMessage,
        BodyForCommands: commandBody,
        RawBody: parsedMessage,
        CommandBody: commandBody,
        SessionKey: sessionKey,
        Provider: INTERNAL_MESSAGE_CHANNEL,
        Surface: INTERNAL_MESSAGE_CHANNEL,
        OriginatingChannel: INTERNAL_MESSAGE_CHANNEL,
        ChatType: "direct",
        CommandAuthorized: true,
        MessageSid: clientRunId,
        SenderId: clientInfo?.id,
        SenderName: clientInfo?.displayName,
        SenderUsername: clientInfo?.displayName,
        GatewayClientScopes: client?.connect?.scopes,
      };

      const agentId = resolveSessionAgentId({
        sessionKey,
        config: cfg,
      });
      const { onModelSelected, ...prefixOptions } = createReplyPrefixOptions({
        cfg,
        agentId,
        channel: INTERNAL_MESSAGE_CHANNEL,
      });
      const finalReplyParts: string[] = [];
      const dispatcher = createReplyDispatcher({
        ...prefixOptions,
        onError: (err) => {
          context.logGateway.warn(`webchat dispatch failed: ${formatForLog(err)}`);
        },
        deliver: async (payload, info) => {
          if (info.kind !== "final") {
            return;
          }
          const text = payload.text?.trim() ?? "";
          if (!text) {
            return;
          }
          finalReplyParts.push(text);
        },
      });

      let agentRunStarted = false;
      void dispatchInboundMessage({
        ctx,
        cfg: cfgForDispatch,
        dispatcher,
        replyOptions: {
          runId: clientRunId,
          abortSignal: abortController.signal,
          images: parsedImages.length > 0 ? parsedImages : undefined,
          disableBlockStreaming: true,
          // Keep reasoning callbacks wired for webchat turns so `/reasoning stream`
          // (or session-level reasoning=stream) can emit live thinking deltas.
          onReasoningStream: (payload) => void payload,
          onAgentRunStart: (runId) => {
            agentRunStarted = true;
            // Register the mapping so the agent event handler can route
            // streaming deltas and the final event back to the correct
            // session key and client run ID.  Without this, the fallback
            // `resolveSessionKeyForRun` may return undefined and chat
            // events are silently skipped.
            context.addChatRun(runId, {
              sessionKey,
              clientRunId,
            });
            const connId = typeof client?.connId === "string" ? client.connId : undefined;
            const wantsToolEvents = hasGatewayClientCap(
              client?.connect?.caps,
              GATEWAY_CLIENT_CAPS.TOOL_EVENTS,
            );
            if (connId && wantsToolEvents) {
              context.registerToolEventRecipient(runId, connId);
              // Register for any other active runs *in the same session* so
              // late-joining clients (e.g. page refresh mid-response) receive
              // in-progress tool events without leaking cross-session data.
              for (const [activeRunId, active] of context.chatAbortControllers) {
                if (activeRunId !== runId && active.sessionKey === sessionKey) {
                  context.registerToolEventRecipient(activeRunId, connId);
                }
              }
            }
          },
          onModelSelected,
        },
      })
        .then(() => {
          if (!agentRunStarted) {
            const combinedReply = finalReplyParts
              .map((part) => part.trim())
              .filter(Boolean)
              .join("\n\n")
              .trim();
            let message: Record<string, unknown> | undefined;
            if (combinedReply) {
              const { storePath: latestStorePath, entry: latestEntry } =
                loadSessionEntry(sessionKey);
              const sessionId = latestEntry?.sessionId ?? entry?.sessionId ?? clientRunId;
              const appended = appendAssistantTranscriptMessage({
                message: combinedReply,
                sessionId,
                storePath: latestStorePath,
                sessionFile: latestEntry?.sessionFile,
                createIfMissing: true,
              });
              if (appended.ok) {
                message = appended.message;
              } else {
                context.logGateway.warn(
                  `webchat transcript append failed: ${appended.error ?? "unknown error"}`,
                );
                const now = Date.now();
                message = {
                  role: "assistant",
                  content: [{ type: "text", text: combinedReply }],
                  timestamp: now,
                  // Keep this compatible with Pi stopReason enums even though this message isn't
                  // persisted to the transcript due to the append failure.
                  stopReason: "stop",
                  usage: { input: 0, output: 0, totalTokens: 0 },
                };
              }
            }
            broadcastChatFinal({
              context,
              runId: clientRunId,
              sessionKey,
              message,
            });
          }
          context.dedupe.set(`chat:${clientRunId}`, {
            ts: Date.now(),
            ok: true,
            payload: { runId: clientRunId, status: "ok" as const },
          });
        })
        .catch((err) => {
          const error = errorShape(ErrorCodes.UNAVAILABLE, String(err));
          context.dedupe.set(`chat:${clientRunId}`, {
            ts: Date.now(),
            ok: false,
            payload: {
              runId: clientRunId,
              status: "error" as const,
              summary: String(err),
            },
            error,
          });
          broadcastChatError({
            context,
            runId: clientRunId,
            sessionKey,
            errorMessage: String(err),
          });
        })
        .finally(() => {
          context.chatAbortControllers.delete(clientRunId);
        });
    } catch (err) {
      const error = errorShape(ErrorCodes.UNAVAILABLE, String(err));
      const payload = {
        runId: clientRunId,
        status: "error" as const,
        summary: String(err),
      };
      context.dedupe.set(`chat:${clientRunId}`, {
        ts: Date.now(),
        ok: false,
        payload,
        error,
      });
      respond(false, payload, error, {
        runId: clientRunId,
        error: formatForLog(err),
      });
    }
  },
  "chat.inject": async ({ params, respond, context }) => {
    if (!validateChatInjectParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid chat.inject params: ${formatValidationErrors(validateChatInjectParams.errors)}`,
        ),
      );
      return;
    }
    const p = params as {
      sessionKey: string;
      message: string;
      label?: string;
    };

    // Load session to find transcript file
    const rawSessionKey = p.sessionKey;
    const { storePath, entry, canonicalKey } = loadSessionEntry(rawSessionKey);
    const sessionKey = canonicalKey;
    const sessionId = entry?.sessionId;
    if (!sessionId || !storePath) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "session not found"));
      return;
    }

    const appended = appendAssistantTranscriptMessage({
      message: p.message,
      label: p.label,
      sessionId,
      storePath,
      sessionFile: entry?.sessionFile,
      createIfMissing: false,
    });
    if (!appended.ok || !appended.messageId || !appended.message) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `failed to write transcript: ${appended.error ?? "unknown error"}`,
        ),
      );
      return;
    }

    // Broadcast to webchat for immediate UI update
    const chatPayload = {
      runId: `inject-${appended.messageId}`,
      sourceRunId: `inject-${appended.messageId}`,
      sessionKey,
      seq: 0,
      updatedAtMs: Date.now(),
      state: "final" as const,
      message: appended.message,
    };
    context.broadcast("chat", chatPayload);
    context.nodeSendToSession(sessionKey, "chat", chatPayload);

    respond(true, { ok: true, messageId: appended.messageId });
  },
};
