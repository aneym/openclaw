import { requestHeartbeatNow } from "../infra/heartbeat-wake.js";
import { readRestartSentinel } from "../infra/restart-sentinel.js";
import { consumeInterruptedSessions } from "../infra/running-sessions.js";
import { enqueueSystemEvent } from "../infra/system-events.js";

const INTERRUPTED_MESSAGE =
  "Your previous turn was interrupted by a gateway restart. The response was not completed.";

/**
 * On gateway startup, detect sessions that were mid-turn when the previous
 * process died. Inject a system event so the agent knows context was lost,
 * then trigger a heartbeat wake so the sessions actually process the event.
 */
export async function wakeInterruptedSessions() {
  const interrupted = consumeInterruptedSessions();
  if (interrupted.length === 0) return;

  // Read the restart sentinel (not yet consumed) to identify the session
  // that triggered the restart — it gets its own notification via the
  // sentinel wake flow, so we skip it here to avoid duplicates.
  const sentinel = await readRestartSentinel();
  const sentinelSessionKey = sentinel?.payload.sessionKey?.trim();

  let wokenCount = 0;
  for (const session of interrupted) {
    // Skip the session that triggered the restart (handled by restart sentinel)
    if (sentinelSessionKey && session.sessionKey === sentinelSessionKey) continue;

    // Skip subagent/cron sessions — they have their own recovery via subagent-registry
    if (session.sessionKey.startsWith("cron:")) continue;

    enqueueSystemEvent(INTERRUPTED_MESSAGE, { sessionKey: session.sessionKey });
    wokenCount++;
  }

  if (wokenCount > 0) {
    requestHeartbeatNow({ reason: "interrupted-sessions" });
  }
}

export function shouldWakeInterruptedSessions() {
  return !process.env.VITEST && process.env.NODE_ENV !== "test";
}
