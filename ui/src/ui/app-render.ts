import { html, nothing } from "lit";
import type { AppViewState } from "./app-view-state";
import type { NavSessionEntry } from "./views/thread-list";
import { renderTab, renderThemeToggle } from "./app-render.helpers";
import { syncUrlWithSessionKey } from "./app-settings";
import { renderCodingPanel } from "./views/coding-panel";
import { loadChannels } from "./controllers/channels";
import { loadChatHistory } from "./controllers/chat";
import {
  applyConfig,
  loadConfig,
  runUpdate,
  saveConfig,
  updateConfigFormValue,
  removeConfigFormValue,
} from "./controllers/config";
import {
  loadCronRuns,
  toggleCronJob,
  runCronJob,
  removeCronJob,
  addCronJob,
} from "./controllers/cron";
import { loadDebug, callDebugMethod } from "./controllers/debug";
import {
  approveDevicePairing,
  loadDevices,
  rejectDevicePairing,
  revokeDeviceToken,
  rotateDeviceToken,
} from "./controllers/devices";
import {
  loadExecApprovals,
  removeExecApprovalsFormValue,
  saveExecApprovals,
  updateExecApprovalsFormValue,
} from "./controllers/exec-approvals";
import {
  loadGitStatus,
  loadGitLog,
  loadGitDiff,
  stageFiles,
  unstageFiles,
  commitChanges,
  discardFiles,
} from "./controllers/git";
import { loadLogs } from "./controllers/logs";
import { loadNodes } from "./controllers/nodes";
import { loadPresence } from "./controllers/presence";
import { deleteSession, loadSessions, patchSession } from "./controllers/sessions";
import {
  installSkill,
  loadSkills,
  saveSkillApiKey,
  updateSkillEdit,
  updateSkillEnabled,
} from "./controllers/skills";
import { icons } from "./icons";
import { TAB_GROUPS, subtitleForTab, titleForTab } from "./navigation";
import { allLeaves } from "./split-tree";
import "./components/resizable-divider";
import { createThreadDescriptor, createThreadState } from "./thread-state";
import { saveThreadDescriptors } from "./thread-storage";
import { renderArtifactPanel } from "./views/artifact-panel";
import { renderChannels } from "./views/channels";
import { renderConfig } from "./views/config";
import { renderModels } from "./views/models";
import { renderCron } from "./views/cron";
import { renderDebug } from "./views/debug";
import { renderExecApprovalPrompt } from "./views/exec-approval";
import { renderGatewayUrlConfirmation } from "./views/gateway-url-confirmation";
import { renderGit } from "./views/git";
import { renderInstances } from "./views/instances";
import { renderLogs } from "./views/logs";
import { renderNodes } from "./views/nodes";
import { renderOverview } from "./views/overview";
import { renderSessions } from "./views/sessions";
import { renderSkills } from "./views/skills";
import { renderSplitPaneContainer } from "./views/split-pane-container";
import { renderNavThreadList } from "./views/thread-list";
import { renderToolApprovalPrompt } from "./views/tool-approval";


/**
 * Focus the chat composer textarea.
 * Uses a short setTimeout to ensure Lit's async render cycle has flushed.
 */
function focusComposer() {
  setTimeout(() => {
    const el = document.querySelector<HTMLTextAreaElement>(".chat-compose textarea");
    if (el && !el.disabled) {
      el.focus();
    }
  }, 50);
}

/**
 * Create a fresh thread/session and navigate to it.
 * Used by the sidebar "New session" button and the chat compose "New session" button.
 */
function startNewSession(state: AppViewState) {
  const base = state.sessionKey.split(":thread:")[0];
  const desc = createThreadDescriptor(base);
  const thread = createThreadState(desc);
  state.threads.set(desc.id, thread);
  state.sessionKeyToThreadId.set(desc.sessionKey, desc.id);
  saveThreadDescriptors(state.getThreadDescriptors());
  state.threads = new Map(state.threads);

  // In split mode, update the focused pane's leaf
  if (state.splitLayout && state.focusedPaneId) {
    state.setThreadInPane(state.focusedPaneId, desc.sessionKey);
  }

  state.sessionKey = desc.sessionKey;
  state.chatMessage = "";
  state.chatStream = null;
  state.chatStreamStartedAt = null;
  state.chatRunId = null;
  state.chatMessages = [];
  state.resetToolStream();
  state.resetChatScroll();
  state.applySettings({
    ...state.settings,
    sessionKey: desc.sessionKey,
    lastActiveSessionKey: desc.sessionKey,
  });
  void state.loadAssistantIdentity();
  syncUrlWithSessionKey(
    state as unknown as Parameters<typeof syncUrlWithSessionKey>[0],
    desc.sessionKey,
    true,
  );
  focusComposer();
}

/** Ensure the current session key is always present in the sessions list */
/**
 * Ensure that the active session key and all open pane keys
 * are present in the sessions list (new threads may not have
 * server-side entries yet).
 */
function ensureOpenSessions(
  sessions: NavSessionEntry[],
  currentKey: string,
  openPaneKeys: Set<string>,
): NavSessionEntry[] {
  const existing = new Set(sessions.map((s) => s.key));
  const missing: NavSessionEntry[] = [];
  const allKeys = new Set([currentKey, ...openPaneKeys]);
  for (const key of allKeys) {
    if (!existing.has(key)) {
      missing.push({ key, updatedAt: Date.now() });
    }
  }
  if (missing.length === 0) {
    return sessions;
  }
  return [...missing, ...sessions];
}

/** Return the set of session keys that currently have an active agent run. */
function computeRunningSessions(state: AppViewState): Set<string> {
  return state.runningSessions;
}

/** Return session keys currently visible in any split pane. */
function computeOpenPaneKeys(state: AppViewState): Set<string> {
  if (!state.splitLayout) {
    return new Set();
  }
  return new Set(allLeaves(state.splitLayout.root).map((l) => l.threadId));
}

type DevFlag = "ui" | "gw";

/** Detect active dev environments. Vite dev always implies a local dev gateway. */
function getDevFlags(): DevFlag[] {
  const flags: DevFlag[] = [];
  if (import.meta.env.DEV) {
    // Vite dev server — always talking to a local dev gateway
    flags.push("ui", "gw");
  } else if ((window as unknown as Record<string, unknown>).__OPENCLAW_DEV__) {
    // Gateway-served build in dev mode (NODE_ENV !== 'production')
    flags.push("gw");
  }
  return flags;
}

export function renderApp(state: AppViewState) {
  const presenceCount = state.presenceEntries.length;
  const sessionsCount = state.sessionsResult?.count ?? null;
  const cronNext = state.cronStatus?.nextWakeAtMs ?? null;
  const isChat = state.tab === "chat";
  const chatFocus = isChat && (state.settings.chatFocusMode || state.onboarding);
  const devFlags = getDevFlags();
  const isDev = devFlags.length > 0;

  return html`
    <div class="shell ${isChat ? "shell--chat" : ""} ${chatFocus ? "shell--chat-focus" : ""} ${state.settings.navCollapsed ? "shell--nav-collapsed" : ""} ${state.onboarding ? "shell--onboarding" : ""}" data-dev="${isDev ? "true" : nothing}" style="${state.settings.navWidth ? `--shell-nav-width: ${state.settings.navWidth}px` : ""}">
      <header class="topbar">
        <div class="topbar-left">
          <button
            class="nav-collapse-toggle"
            @click=${() =>
              state.applySettings({
                ...state.settings,
                navCollapsed: !state.settings.navCollapsed,
              })}
            title="${state.settings.navCollapsed ? "Expand sidebar (⌘\\)" : "Collapse sidebar (⌘\\)"}"
            aria-label="${state.settings.navCollapsed ? "Expand sidebar" : "Collapse sidebar"}"
          >
            <span class="nav-collapse-toggle__icon">${icons.menu}</span>
          </button>
          <div class="brand">
            <div class="brand-logo">
              <img src="/favicon.svg" alt="kbot" />
            </div>
            <div class="brand-text">
              <div class="brand-title">KBOT</div>
              <div class="brand-sub">Gateway Dashboard</div>
            </div>
          </div>
          ${
            devFlags.includes("ui")
              ? html`
                  <span class="dev-badge ui-dev">UI DEV</span>
                `
              : nothing
          }
          ${
            devFlags.includes("gw")
              ? html`
                  <span class="dev-badge gw-dev">GW DEV</span>
                `
              : nothing
          }
        </div>
        <div class="topbar-status">
          <div class="pill">
            <span class="statusDot ${state.connected ? "ok" : ""}"></span>
            <span>Health</span>
            <span class="mono">${state.connected ? "OK" : "Offline"}</span>
          </div>
          ${
            isChat
              ? html`
            <button
              class="pill ${state.gitPanelOpen ? "active" : ""}"
              style="cursor:pointer;display:inline-flex;align-items:center;gap:4px;${state.gitPanelOpen ? "background:var(--accent,#007acc);color:#fff;" : ""}"
              @click=${() => {
                state.gitPanelOpen = !state.gitPanelOpen;
              }}
              title=${state.gitPanelOpen ? "Close source control (⇧⌘G)" : "Source control (⇧⌘G)"}
            >
              <span style="display:inline-flex;width:14px;height:14px;">${icons.gitBranch}</span>
              <span>Git</span>
            </button>
          `
              : nothing
          }
          ${renderThemeToggle(state)}
          ${state.tab === "chat" ? html`
            <button
              class="coding-panel-toggle ${state.codingPanelOpen ? 'coding-panel-toggle--active' : ''}"
              @click=${() => state.toggleCodingPanel()}
              title="${state.codingPanelOpen ? 'Close code sessions' : 'Open code sessions'}"
              style="background:none;border:none;color:var(--text-secondary);cursor:pointer;padding:4px 8px;border-radius:4px;display:flex;align-items:center;gap:4px;font-size:12px;${state.codingPanelOpen ? 'color:var(--accent);background:var(--hover);' : ''}"
            >
              ${icons.code}
              <span>Code</span>
              ${state.codingSessions.filter((s: any) => s.status === 'running' || s.status === 'starting').length > 0
                ? html`<span style="background:var(--accent);color:white;font-size:10px;padding:0 5px;border-radius:8px;font-weight:700;">${state.codingSessions.filter((s: any) => s.status === 'running' || s.status === 'starting').length}</span>`
                : nothing}
            </button>
          ` : nothing}
        </div>
      </header>
      <aside class="nav ${state.settings.navCollapsed ? "nav--collapsed" : ""}">
        ${TAB_GROUPS.map((group) => {
          const isGroupCollapsed =
            state.settings.navGroupsCollapsed[group.label] ?? group.label !== "Chat";
          const hasActiveTab = group.tabs.some((tab) => tab === state.tab);
          return html`
            <div class="nav-group ${isGroupCollapsed && !hasActiveTab ? "nav-group--collapsed" : ""}">
              <button
                class="nav-label"
                @click=${() => {
                  const next = { ...state.settings.navGroupsCollapsed };
                  next[group.label] = !isGroupCollapsed;
                  state.applySettings({
                    ...state.settings,
                    navGroupsCollapsed: next,
                  });
                }}
                aria-expanded=${!isGroupCollapsed}
              >
                <span class="nav-label__text">${group.label}</span>
                <span class="nav-label__chevron">${isGroupCollapsed ? "+" : "−"}</span>
              </button>
              <div class="nav-group__items">
                ${group.tabs.map((tab) => renderTab(state, tab))}
                ${
                  group.label === "Chat" && state.tab === "chat"
                    ? renderNavThreadList({
                        sessions: ensureOpenSessions(
                          state.sessionsResult?.sessions ?? [],
                          state.sessionKey,
                          computeOpenPaneKeys(state),
                        ),
                        activeSessionKey: state.sessionKey,
                        unreadCounts: new Map(),
                        runningSessions: computeRunningSessions(state),
                        openPaneKeys: computeOpenPaneKeys(state),
                        onSelect: (sessionKey) => {
                          // In split mode, also update the focused pane's leaf
                          if (state.splitLayout && state.focusedPaneId) {
                            state.setThreadInPane(state.focusedPaneId, sessionKey);
                          }
                          // Full session switch: clear state + load history
                          state.sessionKey = sessionKey;
                          state.chatMessage = "";
                          state.chatMessages = [];
                          state.chatToolMessages = [];
                          state.chatStream = null;
                          state.chatStreamStartedAt = null;
                          state.chatRunId = null;
                          state.resetToolStream();
                          state.resetChatScroll();
                          state.applySettings({
                            ...state.settings,
                            sessionKey,
                            lastActiveSessionKey: sessionKey,
                          });
                          void state.loadAssistantIdentity();
                          syncUrlWithSessionKey(
                            state as unknown as Parameters<typeof syncUrlWithSessionKey>[0],
                            sessionKey,
                            true,
                          );
                          void loadChatHistory(state);
                          focusComposer();
                        },
                        onRename: (sessionKey, label) => {
                          void patchSession(state, sessionKey, { label });
                        },
                        onDelete: (sessionKey) => {
                          void deleteSession(state, sessionKey);
                        },
                        onArchive: (sessionKey) => {
                          void patchSession(state, sessionKey, { archived: true });
                          if (state.splitLayout) {
                            const leaf = allLeaves(state.splitLayout.root).find(
                              (l) => l.threadId === sessionKey,
                            );
                            if (leaf) {
                              state.closePane(leaf.id);
                            }
                          }
                          if (state.sessionKey === sessionKey) {
                            startNewSession(state);
                          }
                        },
                        onUnarchive: (sessionKey) => {
                          void patchSession(state, sessionKey, { archived: false });
                        },
                        onNewSession: () => startNewSession(state),
                        onRequestUpdate: () => {
                          // Force re-render by touching a reactive property
                          state.threads = new Map(state.threads);
                        },
                      })
                    : nothing
                }
              </div>
            </div>
          `;
        })}
        ${(() => {
          const resCollapsed = state.settings.navGroupsCollapsed["Resources"] ?? true;
          return html`
          <div class="nav-group nav-group--links ${resCollapsed ? "nav-group--collapsed" : ""}">
            <button
              class="nav-label"
              @click=${() => {
                const next = { ...state.settings.navGroupsCollapsed };
                next["Resources"] = !resCollapsed;
                state.applySettings({
                  ...state.settings,
                  navGroupsCollapsed: next,
                });
              }}
              aria-expanded=${!resCollapsed}
            >
              <span class="nav-label__text">Resources</span>
              <span class="nav-label__chevron">${resCollapsed ? "+" : "−"}</span>
            </button>
            <div class="nav-group__items">
              <a
                class="nav-item nav-item--external"
                href="https://docs.openclaw.ai"
                target="_blank"
                rel="noreferrer"
                title="Docs (opens in new tab)"
              >
                <span class="nav-item__icon" aria-hidden="true">${icons.book}</span>
                <span class="nav-item__text">Docs</span>
              </a>
            </div>
          </div>`;
        })()}
      </aside>
      <div
        class="nav-resize-handle ${state.settings.navCollapsed ? "nav-resize-handle--hidden" : ""}"
        @mousedown=${(e: MouseEvent) => {
          e.preventDefault();
          const shell = (e.target as HTMLElement).closest(".shell") as HTMLElement;
          if (!shell) {
            return;
          }
          const startX = e.clientX;
          const startWidth =
            parseInt(getComputedStyle(shell).getPropertyValue("--shell-nav-width")) || 220;
          const onMove = (me: MouseEvent) => {
            const newWidth = Math.max(140, Math.min(500, startWidth + me.clientX - startX));
            shell.style.setProperty("--shell-nav-width", newWidth + "px");
          };
          const onUp = () => {
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
            // Persist the width
            const finalWidth =
              parseInt(getComputedStyle(shell).getPropertyValue("--shell-nav-width")) || 220;
            state.applySettings({ ...state.settings, navWidth: finalWidth });
          };
          document.body.style.cursor = "col-resize";
          document.body.style.userSelect = "none";
          document.addEventListener("mousemove", onMove);
          document.addEventListener("mouseup", onUp);
        }}
      ></div>
      <main class="content ${isChat ? "content--chat" : ""}">
        <section class="content-header">
          <div>
            <div class="page-title">${titleForTab(state.tab)}</div>
            <div class="page-sub">${subtitleForTab(state.tab)}</div>
          </div>
          <div class="page-meta">
            ${state.lastError ? html`<div class="pill danger">${state.lastError}</div>` : nothing}
          </div>
        </section>

        ${
          state.tab === "overview"
            ? renderOverview({
                connected: state.connected,
                hello: state.hello,
                settings: state.settings,
                password: state.password,
                lastError: state.lastError,
                presenceCount,
                sessionsCount,
                cronEnabled: state.cronStatus?.enabled ?? null,
                cronNext,
                lastChannelsRefresh: state.channelsLastSuccess,
                onSettingsChange: (next) => state.applySettings(next),
                onPasswordChange: (next) => (state.password = next),
                onSessionKeyChange: (next) => {
                  state.sessionKey = next;
                  state.chatMessage = "";
                  state.resetToolStream();
                  state.applySettings({
                    ...state.settings,
                    sessionKey: next,
                    lastActiveSessionKey: next,
                  });
                  void state.loadAssistantIdentity();
                },
                onConnect: () => state.connect(),
                onRefresh: () => state.loadOverview(),
              })
            : nothing
        }

        ${
          state.tab === "channels"
            ? renderChannels({
                connected: state.connected,
                loading: state.channelsLoading,
                snapshot: state.channelsSnapshot,
                lastError: state.channelsError,
                lastSuccessAt: state.channelsLastSuccess,
                whatsappMessage: state.whatsappLoginMessage,
                whatsappQrDataUrl: state.whatsappLoginQrDataUrl,
                whatsappConnected: state.whatsappLoginConnected,
                whatsappBusy: state.whatsappBusy,
                configSchema: state.configSchema,
                configSchemaLoading: state.configSchemaLoading,
                configForm: state.configForm,
                configUiHints: state.configUiHints,
                configSaving: state.configSaving,
                configFormDirty: state.configFormDirty,
                nostrProfileFormState: state.nostrProfileFormState,
                nostrProfileAccountId: state.nostrProfileAccountId,
                onRefresh: (probe) => loadChannels(state, probe),
                onWhatsAppStart: (force) => state.handleWhatsAppStart(force),
                onWhatsAppWait: () => state.handleWhatsAppWait(),
                onWhatsAppLogout: () => state.handleWhatsAppLogout(),
                onConfigPatch: (path, value) => updateConfigFormValue(state, path, value),
                onConfigSave: () => state.handleChannelConfigSave(),
                onConfigReload: () => state.handleChannelConfigReload(),
                onNostrProfileEdit: (accountId, profile) =>
                  state.handleNostrProfileEdit(accountId, profile),
                onNostrProfileCancel: () => state.handleNostrProfileCancel(),
                onNostrProfileFieldChange: (field, value) =>
                  state.handleNostrProfileFieldChange(field, value),
                onNostrProfileSave: () => state.handleNostrProfileSave(),
                onNostrProfileImport: () => state.handleNostrProfileImport(),
                onNostrProfileToggleAdvanced: () => state.handleNostrProfileToggleAdvanced(),
              })
            : nothing
        }

        ${
          state.tab === "instances"
            ? renderInstances({
                loading: state.presenceLoading,
                entries: state.presenceEntries,
                lastError: state.presenceError,
                statusMessage: state.presenceStatus,
                onRefresh: () => loadPresence(state),
              })
            : nothing
        }

        ${
          state.tab === "sessions"
            ? renderSessions({
                loading: state.sessionsLoading,
                result: state.sessionsResult,
                error: state.sessionsError,
                activeMinutes: state.sessionsFilterActive,
                limit: state.sessionsFilterLimit,
                includeGlobal: state.sessionsIncludeGlobal,
                includeUnknown: state.sessionsIncludeUnknown,
                basePath: state.basePath,
                onFiltersChange: (next) => {
                  state.sessionsFilterActive = next.activeMinutes;
                  state.sessionsFilterLimit = next.limit;
                  state.sessionsIncludeGlobal = next.includeGlobal;
                  state.sessionsIncludeUnknown = next.includeUnknown;
                },
                onRefresh: () => loadSessions(state),
                onPatch: (key, patch) => patchSession(state, key, patch),
                onDelete: (key) => deleteSession(state, key),
              })
            : nothing
        }

        ${
          state.tab === "cron"
            ? renderCron({
                loading: state.cronLoading,
                status: state.cronStatus,
                jobs: state.cronJobs,
                error: state.cronError,
                busy: state.cronBusy,
                form: state.cronForm,
                channels: state.channelsSnapshot?.channelMeta?.length
                  ? state.channelsSnapshot.channelMeta.map((entry) => entry.id)
                  : (state.channelsSnapshot?.channelOrder ?? []),
                channelLabels: state.channelsSnapshot?.channelLabels ?? {},
                channelMeta: state.channelsSnapshot?.channelMeta ?? [],
                runsJobId: state.cronRunsJobId,
                runs: state.cronRuns,
                onFormChange: (patch) => (state.cronForm = { ...state.cronForm, ...patch }),
                onRefresh: () => state.loadCron(),
                onAdd: () => addCronJob(state),
                onToggle: (job, enabled) => toggleCronJob(state, job, enabled),
                onRun: (job) => runCronJob(state, job),
                onRemove: (job) => removeCronJob(state, job),
                onLoadRuns: (jobId) => loadCronRuns(state, jobId),
              })
            : nothing
        }

        ${
          state.tab === "skills"
            ? renderSkills({
                loading: state.skillsLoading,
                report: state.skillsReport,
                error: state.skillsError,
                filter: state.skillsFilter,
                edits: state.skillEdits,
                messages: state.skillMessages,
                busyKey: state.skillsBusyKey,
                onFilterChange: (next) => (state.skillsFilter = next),
                onRefresh: () => loadSkills(state, { clearMessages: true }),
                onToggle: (key, enabled) => updateSkillEnabled(state, key, enabled),
                onEdit: (key, value) => updateSkillEdit(state, key, value),
                onSaveKey: (key) => saveSkillApiKey(state, key),
                onInstall: (skillKey, name, installId) =>
                  installSkill(state, skillKey, name, installId),
              })
            : nothing
        }

        ${
          state.tab === "nodes"
            ? renderNodes({
                loading: state.nodesLoading,
                nodes: state.nodes,
                devicesLoading: state.devicesLoading,
                devicesError: state.devicesError,
                devicesList: state.devicesList,
                configForm:
                  state.configForm ??
                  (state.configSnapshot?.config as Record<string, unknown> | null),
                configLoading: state.configLoading,
                configSaving: state.configSaving,
                configDirty: state.configFormDirty,
                configFormMode: state.configFormMode,
                execApprovalsLoading: state.execApprovalsLoading,
                execApprovalsSaving: state.execApprovalsSaving,
                execApprovalsDirty: state.execApprovalsDirty,
                execApprovalsSnapshot: state.execApprovalsSnapshot,
                execApprovalsForm: state.execApprovalsForm,
                execApprovalsSelectedAgent: state.execApprovalsSelectedAgent,
                execApprovalsTarget: state.execApprovalsTarget,
                execApprovalsTargetNodeId: state.execApprovalsTargetNodeId,
                onRefresh: () => loadNodes(state),
                onDevicesRefresh: () => loadDevices(state),
                onDeviceApprove: (requestId) => approveDevicePairing(state, requestId),
                onDeviceReject: (requestId) => rejectDevicePairing(state, requestId),
                onDeviceRotate: (deviceId, role, scopes) =>
                  rotateDeviceToken(state, { deviceId, role, scopes }),
                onDeviceRevoke: (deviceId, role) => revokeDeviceToken(state, { deviceId, role }),
                onLoadConfig: () => loadConfig(state),
                onLoadExecApprovals: () => {
                  const target =
                    state.execApprovalsTarget === "node" && state.execApprovalsTargetNodeId
                      ? { kind: "node" as const, nodeId: state.execApprovalsTargetNodeId }
                      : { kind: "gateway" as const };
                  return loadExecApprovals(state, target);
                },
                onBindDefault: (nodeId) => {
                  if (nodeId) {
                    updateConfigFormValue(state, ["tools", "exec", "node"], nodeId);
                  } else {
                    removeConfigFormValue(state, ["tools", "exec", "node"]);
                  }
                },
                onBindAgent: (agentIndex, nodeId) => {
                  const basePath = ["agents", "list", agentIndex, "tools", "exec", "node"];
                  if (nodeId) {
                    updateConfigFormValue(state, basePath, nodeId);
                  } else {
                    removeConfigFormValue(state, basePath);
                  }
                },
                onSaveBindings: () => saveConfig(state),
                onExecApprovalsTargetChange: (kind, nodeId) => {
                  state.execApprovalsTarget = kind;
                  state.execApprovalsTargetNodeId = nodeId;
                  state.execApprovalsSnapshot = null;
                  state.execApprovalsForm = null;
                  state.execApprovalsDirty = false;
                  state.execApprovalsSelectedAgent = null;
                },
                onExecApprovalsSelectAgent: (agentId) => {
                  state.execApprovalsSelectedAgent = agentId;
                },
                onExecApprovalsPatch: (path, value) =>
                  updateExecApprovalsFormValue(state, path, value),
                onExecApprovalsRemove: (path) => removeExecApprovalsFormValue(state, path),
                onSaveExecApprovals: () => {
                  const target =
                    state.execApprovalsTarget === "node" && state.execApprovalsTargetNodeId
                      ? { kind: "node" as const, nodeId: state.execApprovalsTargetNodeId }
                      : { kind: "gateway" as const };
                  return saveExecApprovals(state, target);
                },
              })
            : nothing
        }

        ${
          state.tab === "chat"
            ? renderChatWithArtifactPanel(state)
            : nothing
        }

        ${
          state.tab === "config"
            ? renderConfig({
                raw: state.configRaw,
                originalRaw: state.configRawOriginal,
                valid: state.configValid,
                issues: state.configIssues,
                loading: state.configLoading,
                saving: state.configSaving,
                applying: state.configApplying,
                updating: state.updateRunning,
                connected: state.connected,
                schema: state.configSchema,
                schemaLoading: state.configSchemaLoading,
                uiHints: state.configUiHints,
                formMode: state.configFormMode,
                formValue: state.configForm,
                originalValue: state.configFormOriginal,
                searchQuery: state.configSearchQuery,
                activeSection: state.configActiveSection,
                activeSubsection: state.configActiveSubsection,
                onRawChange: (next) => {
                  state.configRaw = next;
                },
                onFormModeChange: (mode) => (state.configFormMode = mode),
                onFormPatch: (path, value) => updateConfigFormValue(state, path, value),
                onSearchChange: (query) => (state.configSearchQuery = query),
                onSectionChange: (section) => {
                  state.configActiveSection = section;
                  state.configActiveSubsection = null;
                },
                onSubsectionChange: (section) => (state.configActiveSubsection = section),
                onReload: () => loadConfig(state),
                onSave: () => saveConfig(state),
                onApply: () => applyConfig(state),
                onUpdate: () => runUpdate(state),
              })
            : nothing
        }

        ${
          state.tab === "debug"
            ? renderDebug({
                loading: state.debugLoading,
                status: state.debugStatus,
                health: state.debugHealth,
                models: state.debugModels,
                heartbeat: state.debugHeartbeat,
                eventLog: state.eventLog,
                callMethod: state.debugCallMethod,
                callParams: state.debugCallParams,
                callResult: state.debugCallResult,
                callError: state.debugCallError,
                onCallMethodChange: (next) => (state.debugCallMethod = next),
                onCallParamsChange: (next) => (state.debugCallParams = next),
                onRefresh: () => loadDebug(state),
                onCall: () => callDebugMethod(state),
              })
            : nothing
        }

        ${
          state.tab === "logs"
            ? renderLogs({
                loading: state.logsLoading,
                error: state.logsError,
                file: state.logsFile,
                entries: state.logsEntries,
                filterText: state.logsFilterText,
                levelFilters: state.logsLevelFilters,
                autoFollow: state.logsAutoFollow,
                truncated: state.logsTruncated,
                onFilterTextChange: (next) => (state.logsFilterText = next),
                onLevelToggle: (level, enabled) => {
                  state.logsLevelFilters = { ...state.logsLevelFilters, [level]: enabled };
                },
                onToggleAutoFollow: (next) => (state.logsAutoFollow = next),
                onRefresh: () => loadLogs(state, { reset: true }),
                onExport: (lines, label) => state.exportLogs(lines, label),
                onScroll: (event) => state.handleLogsScroll(event),
              })
            : nothing
        }

        ${
          state.tab === "models"
            ? renderModels({
                providers: state.modelsConfig?.providers ?? [],
                loading: state.modelsConfigLoading,
                saving: state.modelsConfigSaving,
                error: state.modelsConfigError,
                connected: state.connected,
                visibleModels: state.visibleModels,
                onToggleModelVisibility: (modelRef, visible) => {
                  state.handleToggleModelVisibility(modelRef, visible);
                },
                onAddProvider: (provider) => {
                  // Sort the new provider's models by capability
                  const sortedProvider = {
                    ...provider,
                    models: [...provider.models].sort((a, b) => {
                      const score = (m: typeof a) => {
                        let s = 0;
                        if (m.reasoning) s += 1000;
                        if (m.input?.includes("image")) s += 100;
                        s += (m.contextWindow ?? 0) / 10000;
                        return s;
                      };
                      return score(b) - score(a);
                    }),
                  };
                  const providers = [...(state.modelsConfig?.providers ?? []), sortedProvider];
                  state.modelsConfig = { ...state.modelsConfig, providers };
                },
                onRemoveProvider: (name) => {
                  const providers = (state.modelsConfig?.providers ?? []).filter(
                    (p) => p.name !== name
                  );
                  state.modelsConfig = { ...state.modelsConfig, providers };
                },
                onSave: () => state.handleModelsConfigSave(),
                onReload: () => state.handleModelsConfigLoad(),
              })
            : nothing
        }
      </main>
      ${renderExecApprovalPrompt(state)}
      ${renderToolApprovalPrompt(state)}
      ${renderGatewayUrlConfirmation(state)}
    </div>
  `;
}

// ── Chat area + global artifact panel ──

function renderChatWithArtifactPanel(state: AppViewState) {
  const hasArtifactTabs = state.artifactTabs.length > 0;
  const artifactOpen = state.artifactOpen && hasArtifactTabs;

  // Always use split pane container - single pane is just a single-leaf layout
  const chatContent = renderSplitPaneContainer(state);

  const gitOpen = state.gitPanelOpen;
  const codingPanelOpen = state.codingPanelOpen;

  // Auto-load git status when panel opens
  if (gitOpen && state.gitFiles.length === 0 && !state.gitLoading && !state.gitError) {
    void loadGitStatus(state);
  }

  // No side panels open — just chat
  if (!artifactOpen && !gitOpen && !codingPanelOpen) {
    return chatContent;
  }

  return html`
    <div class="chat-artifact-wrapper" style="display:flex;flex:1;min-height:0;min-width:0;overflow:hidden;">
      <div class="chat-artifact-wrapper__chat" style="flex:1;min-width:0;min-height:0;overflow:hidden;display:flex;">
        ${chatContent}
      </div>
      ${codingPanelOpen ? html`
        <div class="chat-artifact-wrapper__panel" style="flex:0 0 auto;width:380px;max-width:45%;min-width:280px;min-height:0;overflow:hidden;display:flex;flex-direction:column;border-left:1px solid var(--border);">
          ${renderCodingPanel({
            sessions: state.codingSessions,
            expanded: state.codingExpanded,
            sessionEvents: state.codingSessionEvents,
            sessionPhases: state.codingSessionPhases,
            terminalOpen: state.codingTerminalOpen,
            onToggleExpand: (id: string) => state.handleCodingToggleExpand(id),
            onKill: (id: string) => state.handleCodingKill(id),
            onClose: () => state.toggleCodingPanel(),
            onRefresh: () => state.fetchCodingSessions(),
            onDismiss: (id: string) => state.handleCodingDismiss(id),
            onOpenTerminal: (id: string) => state.handleOpenCodingTerminal(id),
            onCloseTerminal: () => state.handleCloseCodingTerminal(),
            onAttachTerminal: (id: string) => state.handleAttachCodingTerminal(id),
            onRespond: (id: string, text: string, toolUseId?: string) => state.handleCodingRespond(id, text, toolUseId),
            pendingQuestions: state.codingQuestions,
          })}
        </div>
      ` : nothing}
      ${
        artifactOpen
          ? html`
            <div class="chat-artifact-wrapper__panel" style="flex:0 0 auto;width:380px;max-width:45%;min-width:280px;min-height:0;overflow:hidden;display:flex;border-left:1px solid var(--border);">
              ${renderArtifactPanel({
                tabs: state.artifactTabs,
                activeTabId: state.artifactActiveTabId,
                onTabSelect: (tabId) => state.handleArtifactTabSelect(tabId),
                onTabClose: (tabId) => state.handleArtifactTabClose(tabId),
                onRefresh: (tabId) => state.handleArtifactRefresh(tabId),
                onToggleRaw: (tabId) => state.handleArtifactToggleRaw(tabId),
                onCopy: (tabId) => state.handleArtifactCopy(tabId),
                onSave: (tabId, content) => state.handleArtifactSave(tabId, content),
                onAutoSave: (tabId, content) => state.handleArtifactAutoSave(tabId, content),
                onClose: () => state.handleArtifactClose(),
              })}
            </div>
          `
          : nothing
      }
      ${
        gitOpen
          ? html`
            <div class="chat-git-wrapper__panel" style="flex:0 0 auto;width:380px;max-width:40%;min-width:300px;min-height:0;overflow-y:auto;overflow-x:hidden;display:flex;flex-direction:column;border-left:1px solid var(--border);padding:8px 12px;">
              ${renderGit({
                loading: state.gitLoading,
                error: state.gitError,
                branch: state.gitBranch,
                files: state.gitFiles,
                ahead: state.gitAhead,
                behind: state.gitBehind,
                logEntries: state.gitLogEntries,
                logLoading: state.gitLogLoading,
                diff: state.gitDiff,
                diffLoading: state.gitDiffLoading,
                diffStaged: state.gitDiffStaged,
                commitMessage: state.gitCommitMessage,
                committing: state.gitCommitting,
                selectedPath: state.gitSelectedPath,
                stagedCollapsed: state.gitStagedCollapsed,
                changesCollapsed: state.gitChangesCollapsed,
                logCollapsed: state.gitLogCollapsed,
                onRefresh: () => loadGitStatus(state),
                onLoadLog: () => loadGitLog(state),
                onStage: (paths) => stageFiles(state, paths),
                onUnstage: (paths) => unstageFiles(state, paths),
                onDiscard: (paths) => discardFiles(state, paths),
                onCommit: () => commitChanges(state),
                onStageAllAndCommit: async () => {
                  const unstaged = state.gitFiles.filter(
                    (f) => f.working !== " " || (f.index === "?" && f.working === "?"),
                  );
                  if (unstaged.length > 0) {
                    await stageFiles(
                      state,
                      unstaged.map((f) => f.path),
                    );
                  }
                  await commitChanges(state);
                },
                onCommitMessageChange: (next) => {
                  state.gitCommitMessage = next;
                },
                onViewDiff: (staged, path) => loadGitDiff(state, staged, path),
                onToggleStagedCollapsed: () => {
                  state.gitStagedCollapsed = !state.gitStagedCollapsed;
                },
                onToggleChangesCollapsed: () => {
                  state.gitChangesCollapsed = !state.gitChangesCollapsed;
                },
                onToggleLogCollapsed: () => {
                  state.gitLogCollapsed = !state.gitLogCollapsed;
                },
              })}
            </div>
          `
          : nothing
      }
    </div>
  `;
}
