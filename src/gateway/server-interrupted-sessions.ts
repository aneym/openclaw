import type { CliDeps } from "../cli/deps.js";
import type { ChatAbortControllerEntry } from "./chat-abort.js";
import { resolveAgentTimeoutMs } from "../agents/timeout.js";
import { agentCommand } from "../commands/agent.js";
import { loadConfig } from "../config/config.js";
import { readRestartSentinel } from "../infra/restart-sentinel.js";
import { consumeInterruptedSessions } from "../infra/running-sessions.js";
import { enqueueSystemEvent } from "../infra/system-events.js";
import { defaultRuntime } from "../runtime.js";
import { resolveChatRunExpiresAtMs } from "./chat-abort.js";

const INTERRUPTED_MESSAGE =
  "Your previous turn was interrupted by a gateway restart. The response was not completed.";

export type WakeInterruptedSessionsParams = {
  deps: CliDeps;
  /** If provided, runs are registered here so chat.status / chat.abort work. */
  chatAbortControllers?: Map<string, ChatAbortControllerEntry>;
};

/**
 * On gateway startup, detect sessions that were mid-turn when the previous
 * process died. Trigger an agent turn so the session can continue.
 *
 * Runs are registered in chatAbortControllers (when provided) so the webchat
 * stop button works immediately — chat.status can find them, chat.abort can
 * signal them.
 */
export async function wakeInterruptedSessions(params: WakeInterruptedSessionsParams) {
  const interrupted = consumeInterruptedSessions();
  if (interrupted.length === 0) return;

  const sentinel = await readRestartSentinel();
  const sentinelSessionKey = sentinel?.payload.sessionKey?.trim();

  const cfg = loadConfig();
  const timeoutMs = resolveAgentTimeoutMs({ cfg });

  const wakePromises: Promise<void>[] = [];
  for (const session of interrupted) {
    if (sentinelSessionKey && session.sessionKey === sentinelSessionKey) continue;
    if (session.sessionKey.startsWith("cron:")) continue;

    const abortController = new AbortController();
    const runId = session.sessionId ?? session.sessionKey;
    const now = Date.now();

    if (params.chatAbortControllers) {
      params.chatAbortControllers.set(runId, {
        controller: abortController,
        sessionId: runId,
        sessionKey: session.sessionKey,
        startedAtMs: now,
        expiresAtMs: resolveChatRunExpiresAtMs({ now, timeoutMs }),
      });
    }

    wakePromises.push(
      agentCommand(
        {
          message: INTERRUPTED_MESSAGE,
          sessionKey: session.sessionKey,
          runId,
          abortSignal: abortController.signal,
        },
        defaultRuntime,
        params.deps,
      )
        .then(() => {})
        .catch(() => {
          enqueueSystemEvent(INTERRUPTED_MESSAGE, { sessionKey: session.sessionKey });
        })
        .finally(() => {
          params.chatAbortControllers?.delete(runId);
        }),
    );
  }
  await Promise.allSettled(wakePromises);
}

export function shouldWakeInterruptedSessions() {
  return !process.env.VITEST && process.env.NODE_ENV !== "test";
}
