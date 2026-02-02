import type { OpenClawApp } from "./app";
import type { EventLogEntry } from "./app-events";
import type { ExecApprovalRequest } from "./controllers/exec-approval";
import type { ToolApprovalRequest } from "./controllers/tool-approval";
import type { GatewayEventFrame, GatewayHelloOk } from "./gateway";
import type { Tab } from "./navigation";
import type { PaneState } from "./pane-state";
import type { SplitPaneLayout } from "./split-tree";
import type { UiSettings } from "./storage";
import type { ThreadState } from "./thread-state";
import type { AgentsListResult, PresenceEntry, HealthSnapshot, StatusSummary } from "./types";
import type { SlashCommandEntry } from "./ui-types";
import { CHAT_SESSIONS_ACTIVE_MINUTES, flushChatQueueForEvent } from "./app-chat";
import { applySettings, loadCron, refreshActiveTab, setLastActiveSessionKey } from "./app-settings";
import {
  handleAgentEvent,
  handleAgentEventForThread,
  resetToolStream,
  resetToolStreamForThread,
  type AgentEventPayload,
} from "./app-tool-stream";
import { loadAgents } from "./controllers/agents";
import { loadAssistantIdentity } from "./controllers/assistant-identity";
import { loadChatHistory } from "./controllers/chat";
import {
  handleChatEvent,
  handleChatEventForThread,
  type ChatEventPayload,
} from "./controllers/chat";
import { loadDevices } from "./controllers/devices";
import {
  addExecApproval,
  parseExecApprovalRequested,
  parseExecApprovalResolved,
  removeExecApproval,
} from "./controllers/exec-approval";
import { loadNodes } from "./controllers/nodes";
import { loadSessions } from "./controllers/sessions";
import {
  addToolApproval,
  parseToolApprovalRequested,
  parseToolApprovalResolved,
  removeToolApproval,
} from "./controllers/tool-approval";
import { GatewayBrowserClient } from "./gateway";
import { allLeaves } from "./split-tree";

type GatewayHost = {
  settings: UiSettings;
  password: string;
  client: GatewayBrowserClient | null;
  connected: boolean;
  hello: GatewayHelloOk | null;
  lastError: string | null;
  onboarding?: boolean;
  eventLogBuffer: EventLogEntry[];
  eventLog: EventLogEntry[];
  tab: Tab;
  presenceEntries: PresenceEntry[];
  presenceError: string | null;
  presenceStatus: StatusSummary | null;
  agentsLoading: boolean;
  agentsList: AgentsListResult | null;
  agentsError: string | null;
  debugHealth: HealthSnapshot | null;
  assistantName: string;
  assistantAvatar: string | null;
  assistantAgentId: string | null;
  sessionKey: string;
  chatRunId: string | null;
  refreshSessionsAfterChat: Set<string>;
  execApprovalQueue: ExecApprovalRequest[];
  execApprovalError: string | null;
  toolApprovalQueue: ToolApprovalRequest[];
  toolApprovalError: string | null;
  threads: Map<string, ThreadState>;
  activeThreadId: string | null;
  sessionKeyToThreadId: Map<string, string>;
  chatMessages: unknown[];
  runningSessions: Set<string>;
  initDefaultThread: () => void;
  renameThread: (threadId: string, label: string) => void;
  slashCommands: SlashCommandEntry[];
  // Split pane state
  splitLayout: SplitPaneLayout | null;
  paneStates: Map<string, PaneState>;
  loadAllPaneHistories: () => Promise<void>;
  scrollAllPanesToBottom: () => void;
};

type SessionDefaultsSnapshot = {
  defaultAgentId?: string;
  mainKey?: string;
  mainSessionKey?: string;
  scope?: string;
};

function normalizeSessionKeyForDefaults(
  value: string | undefined,
  defaults: SessionDefaultsSnapshot,
): string {
  const raw = (value ?? "").trim();
  const mainSessionKey = defaults.mainSessionKey?.trim();
  if (!mainSessionKey) return raw;
  if (!raw) return mainSessionKey;
  const mainKey = defaults.mainKey?.trim() || "main";
  const defaultAgentId = defaults.defaultAgentId?.trim();
  const isAlias =
    raw === "main" ||
    raw === mainKey ||
    (defaultAgentId &&
      (raw === `agent:${defaultAgentId}:main` || raw === `agent:${defaultAgentId}:${mainKey}`));
  return isAlias ? mainSessionKey : raw;
}

function applySessionDefaults(host: GatewayHost, defaults?: SessionDefaultsSnapshot) {
  if (!defaults?.mainSessionKey) return;
  const resolvedSessionKey = normalizeSessionKeyForDefaults(host.sessionKey, defaults);
  const resolvedSettingsSessionKey = normalizeSessionKeyForDefaults(
    host.settings.sessionKey,
    defaults,
  );
  const resolvedLastActiveSessionKey = normalizeSessionKeyForDefaults(
    host.settings.lastActiveSessionKey,
    defaults,
  );
  const nextSessionKey = resolvedSessionKey || resolvedSettingsSessionKey || host.sessionKey;
  const nextSettings = {
    ...host.settings,
    sessionKey: resolvedSettingsSessionKey || nextSessionKey,
    lastActiveSessionKey: resolvedLastActiveSessionKey || nextSessionKey,
  };
  const shouldUpdateSettings =
    nextSettings.sessionKey !== host.settings.sessionKey ||
    nextSettings.lastActiveSessionKey !== host.settings.lastActiveSessionKey;
  if (nextSessionKey !== host.sessionKey) {
    host.sessionKey = nextSessionKey;
  }
  if (shouldUpdateSettings) {
    applySettings(host as unknown as Parameters<typeof applySettings>[0], nextSettings);
  }
}

export function connectGateway(host: GatewayHost) {
  host.lastError = null;
  host.hello = null;
  host.connected = false;
  host.execApprovalQueue = [];
  host.execApprovalError = null;
  host.toolApprovalQueue = [];
  host.toolApprovalError = null;

  host.client?.stop();
  host.client = new GatewayBrowserClient({
    url: host.settings.gatewayUrl,
    token: host.settings.token.trim() ? host.settings.token : undefined,
    password: host.password.trim() ? host.password : undefined,
    clientName: "openclaw-control-ui",
    mode: "webchat",
    onHello: (hello) => {
      host.connected = true;
      host.lastError = null;
      host.hello = hello;
      applySnapshot(host, hello);

      // ── Reconnect state reset ──────────────────────────────────────
      // On reconnect (especially after gateway restart), stale client-side
      // state must be cleared so the UI accurately reflects the new gateway.

      // 1. Clear runningSessions — the old gateway's runs are gone.
      //    queryChatStatus below will re-populate for any truly active runs.
      host.runningSessions = new Set();

      // 2. Clear chatSending — if a send was in-flight when the WS dropped,
      //    the promise rejected without reaching the finally block, leaving
      //    chatSending=true forever. This unblocks isChatBusy() → queue flush.
      (host as unknown as { chatSending: boolean }).chatSending = false;

      // 3. Clear per-thread chatSending for the same reason.
      for (const thread of host.threads.values()) {
        thread.chatSending = false;
      }

      // 4. Clear compaction toast — the "end" event will never arrive from
      //    the old process.
      (host as unknown as { compactionStatus: unknown }).compactionStatus = null;
      // ──────────────────────────────────────────────────────────────

      // ── Restore active runs IMMEDIATELY ────────────────────────────
      // queryChatStatus is the fastest path to restoring the stop button
      // after reconnect. Run it FIRST, before any slow history/session loads.
      // Incoming delta events also adopt runId (see handleChatEvent), but
      // queryChatStatus is proactive — it works even if no chunks arrive yet.
      void queryChatStatus(host).then(() => {
        // Clear main session stream/tool state only if no active run was restored
        if (!host.chatRunId) {
          (host as unknown as { chatStream: string | null }).chatStream = null;
          (host as unknown as { chatStreamStartedAt: number | null }).chatStreamStartedAt = null;
          resetToolStream(host as unknown as Parameters<typeof resetToolStream>[0]);
        }
        // Clear per-thread state only for threads without an active run
        for (const thread of host.threads.values()) {
          if (!thread.chatRunId) {
            thread.chatStream = null;
            thread.chatStreamStartedAt = null;
            resetToolStreamForThread(thread);
          }
        }

        // Flush queued messages — after reconnect, if no run is active,
        // queued messages would sit forever without this explicit flush.
        void flushChatQueueForEvent(
          host as unknown as Parameters<typeof flushChatQueueForEvent>[0],
        );
      });
      // ──────────────────────────────────────────────────────────────

      void loadAssistantIdentity(host as unknown as OpenClawApp);
      void loadAgents(host as unknown as OpenClawApp);
      void loadNodes(host as unknown as OpenClawApp, { quiet: true });
      void loadDevices(host as unknown as OpenClawApp, { quiet: true });
      // Initialize default thread if none exist yet
      host.initDefaultThread();
      // Mark all threads (and host) as loading before async history fetch
      // so the session picker doesn't flash while history loads.
      (host as unknown as { chatLoading: boolean }).chatLoading = true;
      for (const thread of host.threads.values()) {
        thread.chatLoading = true;
      }
      void refreshActiveTab(host as unknown as Parameters<typeof refreshActiveTab>[0]).then(() => {
        // Load history for all visible split panes (non-focused panes need data)
        void host.loadAllPaneHistories().then(() => {
          // Force all panes to bottom after history loads
          host.scrollAllPanesToBottom();
        });
      });
    },
    onClose: ({ code, reason }) => {
      host.connected = false;
      // Code 1012 = Service Restart (expected during config saves, don't show as error)
      if (code !== 1012) {
        host.lastError = `disconnected (${code}): ${reason || "no reason"}`;
      }
    },
    onEvent: (evt) => handleGatewayEvent(host, evt),
    onGap: ({ expected, received }) => {
      // Seq gaps are harmless for chat events (keyed by runId, not global seq).
      // Log for debugging but don't surface to the user.
      console.warn(`[gateway] seq gap: expected ${expected}, got ${received}`);
    },
  });
  host.client.start();
}

export function handleGatewayEvent(host: GatewayHost, evt: GatewayEventFrame) {
  try {
    handleGatewayEventUnsafe(host, evt);
  } catch (err) {
    console.error("[gateway] handleGatewayEvent error:", evt.event, err);
  }
}

function handleGatewayEventUnsafe(host: GatewayHost, evt: GatewayEventFrame) {
  host.eventLogBuffer = [
    { ts: Date.now(), event: evt.event, payload: evt.payload },
    ...host.eventLogBuffer,
  ].slice(0, 250);
  if (host.tab === "debug") {
    host.eventLog = host.eventLogBuffer;
  }

  if (evt.event === "agent") {
    if (host.onboarding) return;
    const agentPayload = evt.payload as AgentEventPayload | undefined;
    const agentSessionKey = agentPayload?.sessionKey;

    // In split-pane mode, check if any visible pane matches the session key
    if (host.splitLayout && agentSessionKey) {
      const visibleKeys = new Set(allLeaves(host.splitLayout.root).map((l) => l.threadId));
      if (!visibleKeys.has(agentSessionKey)) {
        // Route to background thread: skip tool stream processing
        const bgThreadId = host.sessionKeyToThreadId.get(agentSessionKey);
        if (bgThreadId && bgThreadId !== host.activeThreadId) {
          return;
        }
      } else if (agentSessionKey !== host.sessionKey) {
        // Visible-but-not-focused pane: route to per-thread tool stream
        const paneThreadId = host.sessionKeyToThreadId.get(agentSessionKey);
        const paneThread = paneThreadId ? host.threads.get(paneThreadId) : null;
        if (paneThread) {
          handleAgentEventForThread(paneThread, agentPayload);
          host.threads = new Map(host.threads);
        }
        return;
      }
    } else if (agentSessionKey && agentSessionKey !== host.sessionKey) {
      // Single pane mode: existing background thread logic
      const bgThreadId = host.sessionKeyToThreadId.get(agentSessionKey);
      if (bgThreadId && bgThreadId !== host.activeThreadId) {
        return;
      }
    }

    // Focused session: use host-level tool stream
    handleAgentEvent(host as unknown as Parameters<typeof handleAgentEvent>[0], agentPayload);
    return;
  }

  if (evt.event === "chat") {
    const payload = evt.payload as ChatEventPayload | undefined;
    const eventSessionKey = payload?.sessionKey;

    // Track global running-sessions state (before any early returns)
    if (eventSessionKey && payload) {
      if (payload.state === "delta") {
        if (!host.runningSessions.has(eventSessionKey)) {
          host.runningSessions = new Set([...host.runningSessions, eventSessionKey]);
        }
      } else if (
        payload.state === "final" ||
        payload.state === "error" ||
        payload.state === "aborted"
      ) {
        if (host.runningSessions.has(eventSessionKey)) {
          const next = new Set(host.runningSessions);
          next.delete(eventSessionKey);
          host.runningSessions = next;
        }
      }
    }

    // In split-pane mode, visible pane sessions should not be treated as background
    const visibleSessionKeys = host.splitLayout
      ? new Set(allLeaves(host.splitLayout.root).map((l) => l.threadId))
      : null;

    // Check if this event is for a background thread
    const isVisibleInPane = visibleSessionKeys?.has(eventSessionKey ?? "");
    if (eventSessionKey && eventSessionKey !== host.sessionKey && !isVisibleInPane) {
      const bgThreadId = host.sessionKeyToThreadId.get(eventSessionKey);
      if (bgThreadId && bgThreadId !== host.activeThreadId) {
        const bgThread = host.threads.get(bgThreadId);
        if (bgThread) {
          bgThread.unreadCount++;
          bgThread.hasNewMessages = true;
          bgThread.descriptor.lastActivityAt = Date.now();
          if (
            payload?.state === "final" ||
            payload?.state === "error" ||
            payload?.state === "aborted"
          ) {
            bgThread.chatRunId = null;
            bgThread.chatStream = null;
            bgThread.chatStreamStartedAt = null;
          }
          // Trigger re-render for thread list unread dots
          host.threads = new Map(host.threads);
        }
        return;
      }
    }

    // Route chat events for visible-but-not-focused panes to their thread state.
    // Full lifecycle: state machine, tool stream reset, queue flush, auto-rename.
    if (eventSessionKey && eventSessionKey !== host.sessionKey && isVisibleInPane) {
      const paneThreadId = host.sessionKeyToThreadId.get(eventSessionKey);
      const paneThread = paneThreadId ? host.threads.get(paneThreadId) : null;
      if (paneThread && payload) {
        const threadState = handleChatEventForThread(paneThread, payload);

        if (threadState === "final" || threadState === "error" || threadState === "aborted") {
          resetToolStreamForThread(paneThread);
          const runId = payload.runId;
          if (runId && host.refreshSessionsAfterChat.has(runId)) {
            host.refreshSessionsAfterChat.delete(runId);
            if (threadState === "final") {
              void loadSessions(host as unknown as OpenClawApp, {
                activeMinutes: CHAT_SESSIONS_ACTIVE_MINUTES,
              });
              // Delayed refresh to pick up server-side auto-title
              setTimeout(() => {
                void loadSessions(host as unknown as OpenClawApp, {
                  activeMinutes: CHAT_SESSIONS_ACTIVE_MINUTES,
                });
              }, 3000);
            }
          }

          if (threadState === "final" && eventSessionKey && paneThreadId) {
            void loadChatHistoryForThread(host, eventSessionKey, paneThreadId).then(() => {
              // Flush queued messages for this thread's session
              void flushChatQueueForEvent(
                host as unknown as Parameters<typeof flushChatQueueForEvent>[0],
              );
            });
          } else {
            void flushChatQueueForEvent(
              host as unknown as Parameters<typeof flushChatQueueForEvent>[0],
            );
          }
        }

        paneThread.descriptor.lastActivityAt = Date.now();
        host.threads = new Map(host.threads);
      }
      return;
    }

    if (payload?.sessionKey) {
      setLastActiveSessionKey(
        host as unknown as Parameters<typeof setLastActiveSessionKey>[0],
        payload.sessionKey,
      );
    }
    const state = handleChatEvent(host as unknown as OpenClawApp, payload);
    if (state === "final" || state === "error" || state === "aborted") {
      resetToolStream(host as unknown as Parameters<typeof resetToolStream>[0]);
      const runId = payload?.runId;
      if (runId && host.refreshSessionsAfterChat.has(runId)) {
        host.refreshSessionsAfterChat.delete(runId);
        if (state === "final") {
          void loadSessions(host as unknown as OpenClawApp, {
            activeMinutes: CHAT_SESSIONS_ACTIVE_MINUTES,
          });
          // Delayed refresh to pick up server-side auto-title
          setTimeout(() => {
            void loadSessions(host as unknown as OpenClawApp, {
              activeMinutes: CHAT_SESSIONS_ACTIVE_MINUTES,
            });
          }, 3000);
        }
      }
      if (state === "final") {
        // Load history before flushing the queue so the optimistic user
        // message appended by sendChatMessage isn't overwritten by the
        // history reload.
        void loadChatHistory(host as unknown as OpenClawApp).then(() => {
          void flushChatQueueForEvent(
            host as unknown as Parameters<typeof flushChatQueueForEvent>[0],
          );
        });
      } else {
        void flushChatQueueForEvent(
          host as unknown as Parameters<typeof flushChatQueueForEvent>[0],
        );
      }
    }
    return;
  }

  if (evt.event === "presence") {
    const payload = evt.payload as { presence?: PresenceEntry[] } | undefined;
    if (payload?.presence && Array.isArray(payload.presence)) {
      host.presenceEntries = payload.presence;
      host.presenceError = null;
      host.presenceStatus = null;
    }
    return;
  }

  if (evt.event === "cron" && host.tab === "cron") {
    void loadCron(host as unknown as Parameters<typeof loadCron>[0]);
  }

  if (evt.event === "device.pair.requested" || evt.event === "device.pair.resolved") {
    void loadDevices(host as unknown as OpenClawApp, { quiet: true });
  }

  if (evt.event === "exec.approval.requested") {
    const entry = parseExecApprovalRequested(evt.payload);
    if (entry) {
      host.execApprovalQueue = addExecApproval(host.execApprovalQueue, entry);
      host.execApprovalError = null;
      const delay = Math.max(0, entry.expiresAtMs - Date.now() + 500);
      window.setTimeout(() => {
        host.execApprovalQueue = removeExecApproval(host.execApprovalQueue, entry.id);
      }, delay);
    }
    return;
  }

  if (evt.event === "exec.approval.resolved") {
    const resolved = parseExecApprovalResolved(evt.payload);
    if (resolved) {
      host.execApprovalQueue = removeExecApproval(host.execApprovalQueue, resolved.id);
    }
  }

  if (evt.event === "tool.approval.requested") {
    const entry = parseToolApprovalRequested(evt.payload);
    if (entry) {
      host.toolApprovalQueue = addToolApproval(host.toolApprovalQueue, entry);
      host.toolApprovalError = null;
      const delay = Math.max(0, entry.expiresAtMs - Date.now() + 500);
      window.setTimeout(() => {
        host.toolApprovalQueue = removeToolApproval(host.toolApprovalQueue, entry.id);
      }, delay);
    }
    return;
  }

  if (evt.event === "tool.approval.resolved") {
    const resolved = parseToolApprovalResolved(evt.payload);
    if (resolved) {
      host.toolApprovalQueue = removeToolApproval(host.toolApprovalQueue, resolved.id);
    }
  }
}

/**
 * Load chat history into a specific (non-active) thread state.
 * Used when a visible-but-not-focused pane's run completes.
 */
async function loadChatHistoryForThread(host: GatewayHost, sessionKey: string, threadId: string) {
  if (!host.connected || !host.client) {
    return;
  }
  const thread = host.threads.get(threadId);
  if (!thread) {
    return;
  }
  thread._historyLoading = true;
  try {
    const res = await host.client.request("chat.history", {
      sessionKey,
      limit: 200,
    });
    thread.chatMessages = Array.isArray(res.messages) ? res.messages : [];
    thread.chatThinkingLevel = res.thinkingLevel ?? null;
    host.threads = new Map(host.threads);
  } catch {
    // Non-critical
  } finally {
    thread._historyLoading = false;
  }
}

/**
 * Query chat.status for the current session (and visible split panes)
 * to restore the stop button after reconnect.
 */
async function queryChatStatus(host: GatewayHost) {
  if (!host.connected || !host.client) {
    return;
  }

  // Collect session keys that have an active run so we can rebuild runningSessions
  const activeSessionKeys: string[] = [];

  try {
    const res = await host.client.request("chat.status", {
      sessionKey: host.sessionKey,
    });
    if (res?.activeRun?.runId) {
      host.chatRunId = res.activeRun.runId;
      activeSessionKeys.push(host.sessionKey);
      // Restore stream state so the UI shows the correct visual:
      // - If streamText has content → show the streamed text
      // - If streamText is empty/null → show the three-dot reading indicator
      // Either way, chatStream must be non-null to signal "active run".
      const streamText =
        typeof res.activeRun.streamText === "string" ? res.activeRun.streamText : "";
      (host as unknown as { chatStream: string | null }).chatStream = streamText;
      if (!(host as unknown as { chatStreamStartedAt: number | null }).chatStreamStartedAt) {
        (host as unknown as { chatStreamStartedAt: number | null }).chatStreamStartedAt =
          Date.now();
      }
    }
  } catch {
    // Graceful degradation: older gateways may not support chat.status
  }
  // Also check visible split panes
  if (host.splitLayout) {
    const leaves = allLeaves(host.splitLayout.root);
    for (const leaf of leaves) {
      if (leaf.threadId === host.sessionKey) {
        continue;
      }
      try {
        const res = await host.client.request("chat.status", {
          sessionKey: leaf.threadId,
        });
        if (res?.activeRun?.runId) {
          activeSessionKeys.push(leaf.threadId);
          const threadMapId = host.sessionKeyToThreadId.get(leaf.threadId);
          const thread = threadMapId ? host.threads.get(threadMapId) : null;
          if (thread) {
            thread.chatRunId = res.activeRun.runId;
            // Restore stream state: non-null chatStream signals "active run"
            const paneStreamText =
              typeof res.activeRun.streamText === "string" ? res.activeRun.streamText : "";
            thread.chatStream = paneStreamText;
            if (!thread.chatStreamStartedAt) {
              thread.chatStreamStartedAt = Date.now();
            }
            host.threads = new Map(host.threads);
          }
        }
      } catch {
        // Ignore per-pane failures
      }
    }
  }

  // Rebuild runningSessions from verified active runs.
  // We cleared runningSessions on reconnect; now restore only confirmed-active ones.
  if (activeSessionKeys.length > 0) {
    host.runningSessions = new Set(activeSessionKeys);
  }
}

export function applySnapshot(host: GatewayHost, hello: GatewayHelloOk) {
  const snapshot = hello.snapshot as
    | {
        presence?: PresenceEntry[];
        health?: HealthSnapshot;
        sessionDefaults?: SessionDefaultsSnapshot;
        slashCommands?: SlashCommandEntry[];
      }
    | undefined;
  if (snapshot?.presence && Array.isArray(snapshot.presence)) {
    host.presenceEntries = snapshot.presence;
  }
  if (snapshot?.health) {
    host.debugHealth = snapshot.health;
  }
  if (snapshot?.sessionDefaults) {
    applySessionDefaults(host, snapshot.sessionDefaults);
  }
  if (snapshot?.slashCommands && Array.isArray(snapshot.slashCommands)) {
    host.slashCommands = snapshot.slashCommands;
  }
}
