import crypto from "node:crypto";
import type { CliDeps } from "../cli/deps.js";
import type { ChatAbortControllerEntry } from "./chat-abort.js";
import { resolveAgentTimeoutMs } from "../agents/timeout.js";
import { resolveAnnounceTargetFromKey } from "../agents/tools/sessions-send-helpers.js";
import { normalizeChannelId } from "../channels/plugins/index.js";
import { agentCommand } from "../commands/agent.js";
import { resolveMainSessionKeyFromConfig } from "../config/sessions.js";
import { requestHeartbeatNow } from "../infra/heartbeat-wake.js";
import { resolveOutboundTarget } from "../infra/outbound/targets.js";
import {
  consumeRestartSentinel,
  formatRestartSentinelMessage,
  summarizeRestartSentinel,
} from "../infra/restart-sentinel.js";
import { enqueueSystemEvent } from "../infra/system-events.js";
import { defaultRuntime } from "../runtime.js";
import { deliveryContextFromSession, mergeDeliveryContext } from "../utils/delivery-context.js";
import { resolveChatRunExpiresAtMs } from "./chat-abort.js";
import { loadSessionEntry } from "./session-utils.js";

export async function scheduleRestartSentinelWake(params: {
  deps: CliDeps;
  /** If provided, runs are registered so chat.status / chat.abort work. */
  chatAbortControllers?: Map<string, ChatAbortControllerEntry>;
}) {
  const sentinel = await consumeRestartSentinel();
  if (!sentinel) {
    console.error("[restart-sentinel] no sentinel found");
    return;
  }
  const payload = sentinel.payload;
  const sessionKey = payload.sessionKey?.trim();
  const message = formatRestartSentinelMessage(payload);
  console.error(`[restart-sentinel] found sentinel: sessionKey=${sessionKey} message=${message}`);
  const summary = summarizeRestartSentinel(payload);

  if (!sessionKey) {
    const mainSessionKey = resolveMainSessionKeyFromConfig();
    enqueueSystemEvent(message, { sessionKey: mainSessionKey });
    return;
  }

  // Extract topic/thread ID from sessionKey (supports both :topic: and :thread:)
  // Telegram uses :topic:, other platforms use :thread:
  const topicIndex = sessionKey.lastIndexOf(":topic:");
  const threadIndex = sessionKey.lastIndexOf(":thread:");
  const markerIndex = Math.max(topicIndex, threadIndex);
  const marker = topicIndex > threadIndex ? ":topic:" : ":thread:";

  const baseSessionKey = markerIndex === -1 ? sessionKey : sessionKey.slice(0, markerIndex);
  const threadIdRaw =
    markerIndex === -1 ? undefined : sessionKey.slice(markerIndex + marker.length);
  const sessionThreadId = threadIdRaw?.trim() || undefined;

  const { cfg, entry } = loadSessionEntry(sessionKey);
  const parsedTarget = resolveAnnounceTargetFromKey(baseSessionKey);

  // Prefer delivery context from sentinel (captured at restart) over session store
  // Handles race condition where store wasn't flushed before restart
  const sentinelContext = payload.deliveryContext;
  let sessionDeliveryContext = deliveryContextFromSession(entry);
  if (!sessionDeliveryContext && markerIndex !== -1 && baseSessionKey) {
    const { entry: baseEntry } = loadSessionEntry(baseSessionKey);
    sessionDeliveryContext = deliveryContextFromSession(baseEntry);
  }

  const origin = mergeDeliveryContext(
    sentinelContext,
    mergeDeliveryContext(sessionDeliveryContext, parsedTarget ?? undefined),
  );

  const channelRaw = origin?.channel;
  const channel = channelRaw ? normalizeChannelId(channelRaw) : null;
  const to = origin?.to;
  if (!channel || !to) {
    // Webchat and other sessions without external delivery context:
    // Use agentCommand directly instead of heartbeat (which only processes
    // the main session and can't reach webchat thread sessions).
    console.error(
      `[restart-sentinel] no channel/to (channel=${channel}, to=${to}), using agentCommand for sessionKey=${sessionKey}`,
    );

    const abortController = new AbortController();
    const runId = crypto.randomUUID();
    const now = Date.now();
    const timeoutMs = resolveAgentTimeoutMs({ cfg });

    if (params.chatAbortControllers) {
      params.chatAbortControllers.set(runId, {
        controller: abortController,
        sessionId: runId,
        sessionKey,
        startedAtMs: now,
        expiresAtMs: resolveChatRunExpiresAtMs({ now, timeoutMs }),
      });
    }

    try {
      await agentCommand(
        {
          message,
          sessionKey,
          runId,
          abortSignal: abortController.signal,
        },
        defaultRuntime,
        params.deps,
      );
    } catch (err) {
      // Don't fall back to heartbeat — it's known broken for webchat threads.
      // Log the error; the session will be woken on next user message.
      console.error(`[restart-sentinel] agentCommand failed for ${sessionKey}: ${String(err)}`);
    } finally {
      params.chatAbortControllers?.delete(runId);
    }
    return;
  }

  const resolved = resolveOutboundTarget({
    channel,
    to,
    cfg,
    accountId: origin?.accountId,
    mode: "implicit",
  });
  if (!resolved.ok) {
    enqueueSystemEvent(message, { sessionKey });
    return;
  }

  const threadId =
    payload.threadId ??
    parsedTarget?.threadId ?? // From resolveAnnounceTargetFromKey (extracts :topic:N)
    sessionThreadId ??
    (origin?.threadId != null ? String(origin.threadId) : undefined);

  try {
    await agentCommand(
      {
        message,
        sessionKey,
        to: resolved.to,
        channel,
        deliver: true,
        bestEffortDeliver: true,
        messageChannel: channel,
        threadId,
      },
      defaultRuntime,
      params.deps,
    );
  } catch (err) {
    enqueueSystemEvent(`${summary}\n${String(err)}`, { sessionKey });
  }
}

export function shouldWakeFromRestartSentinel() {
  return !process.env.VITEST && process.env.NODE_ENV !== "test";
}
