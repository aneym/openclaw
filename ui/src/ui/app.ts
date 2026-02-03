import { LitElement, html, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import type { EventLogEntry } from "./app-events";
import type { DevicePairingList } from "./controllers/devices";
import type { ExecApprovalRequest } from "./controllers/exec-approval";
import type { ExecApprovalsFile, ExecApprovalsSnapshot } from "./controllers/exec-approvals";
import type { SkillMessage } from "./controllers/skills";
import type { ToolApprovalRequest } from "./controllers/tool-approval";
import type { GatewayBrowserClient, GatewayHelloOk } from "./gateway";
import type { Tab } from "./navigation";
import type { SplitPaneLayout, SplitDirection } from "./split-tree";
import type { ResolvedTheme, ThemeMode } from "./theme";
import type { ThreadState } from "./thread-state";
import type {
  AgentsListResult,
  ConfigSnapshot,
  ConfigUiHints,
  CronJob,
  CronRunLogEntry,
  CronStatus,
  HealthSnapshot,
  LogEntry,
  LogLevel,
  PresenceEntry,
  ChannelsStatusSnapshot,
  SessionsListResult,
  SkillStatusReport,
  StatusSummary,
  NostrProfile,
} from "./types";
import type { NostrProfileFormState } from "./views/channels.nostr-profile-form";
import {
  handleChannelConfigReload as handleChannelConfigReloadInternal,
  handleChannelConfigSave as handleChannelConfigSaveInternal,
  handleNostrProfileCancel as handleNostrProfileCancelInternal,
  handleNostrProfileEdit as handleNostrProfileEditInternal,
  handleNostrProfileFieldChange as handleNostrProfileFieldChangeInternal,
  handleNostrProfileImport as handleNostrProfileImportInternal,
  handleNostrProfileSave as handleNostrProfileSaveInternal,
  handleNostrProfileToggleAdvanced as handleNostrProfileToggleAdvancedInternal,
  handleWhatsAppLogout as handleWhatsAppLogoutInternal,
  handleWhatsAppStart as handleWhatsAppStartInternal,
  handleWhatsAppWait as handleWhatsAppWaitInternal,
} from "./app-channels";
import {
  clearAllQueuedMessages as clearAllQueuedMessagesInternal,
  flushChatQueueForEvent,
  handleAbortChat as handleAbortChatInternal,
  handleSendChat as handleSendChatInternal,
  removeQueuedMessage as removeQueuedMessageInternal,
  sendQueuedMessageNow as sendQueuedMessageNowInternal,
} from "./app-chat";
import { DEFAULT_CRON_FORM, DEFAULT_LOG_LEVEL_FILTERS } from "./app-defaults";
import { connectGateway as connectGatewayInternal } from "./app-gateway";
import {
  handleConnected,
  handleDisconnected,
  handleFirstUpdated,
  handleUpdated,
} from "./app-lifecycle";
import { renderApp } from "./app-render";
import {
  exportLogs as exportLogsInternal,
  handleChatScroll as handleChatScrollInternal,
  handleLogsScroll as handleLogsScrollInternal,
  resetChatScroll as resetChatScrollInternal,
  scrollAllVisibleChats,
} from "./app-scroll";
import {
  applySettings as applySettingsInternal,
  loadCron as loadCronInternal,
  loadOverview as loadOverviewInternal,
  setTab as setTabInternal,
  setTheme as setThemeInternal,
  onPopState as onPopStateInternal,
  syncUrlWithPanes as syncUrlWithPanesInternal,
} from "./app-settings";
import { resetToolStream as resetToolStreamFn } from "./app-tool-stream";
import {
  resetToolStream as resetToolStreamInternal,
  type ToolStreamEntry,
} from "./app-tool-stream";
import { resolveInjectedAssistantIdentity } from "./assistant-identity";
import { loadAssistantIdentity as loadAssistantIdentityInternal } from "./controllers/assistant-identity";
import { loadChatHistory, markAbortPending } from "./controllers/chat";
import { fetchFileContent } from "./controllers/file";
import { patchSession } from "./controllers/sessions";
import { loadDraft, loadAttachments, loadQueue } from "./draft-storage";
import { type PaneState, type ArtifactTab, syncPaneStates } from "./pane-state";
import {
  createLeaf,
  createTerminalLeaf,
  splitLeaf as splitLeafTree,
  splitLeafWithTerminal,
  removeLeaf as removeLeafTree,
  findLeaf,
  allLeaves,
  allLeafIds,
  serializeLayout,
  deserializeLayout,
  setLeafThread,
  swapLeafThreads,
  moveLeafBeside,
  updateBranchRatio,
  nextLeafId,
} from "./split-tree";
import { loadSettings, type UiSettings } from "./storage";
import {
  type ThreadDescriptor,
  createThreadDescriptor,
  createThreadState,
  snapshotThreadState,
  restoreThreadState,
} from "./thread-state";
import { loadThreadDescriptors, saveThreadDescriptors } from "./thread-storage";
import {
  type ChatAttachment,
  type ChatQueueItem,
  type CronFormState,
  type ModelCatalogEntry,
  type SlashCommandEntry,
} from "./ui-types";
import { parseStreamEvents, detectCurrentPhase } from "./views/coding-panel.js";

declare global {
  interface Window {
    __OPENCLAW_CONTROL_UI_BASE_PATH__?: string;
  }
}

const injectedAssistantIdentity = resolveInjectedAssistantIdentity();

function resolveOnboardingMode(): boolean {
  if (!window.location.search) return false;
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("onboarding");
  if (!raw) return false;
  const normalized = raw.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

@customElement("openclaw-app")
export class OpenClawApp extends LitElement {
  @state() settings: UiSettings = loadSettings();
  @state() password = "";
  @state() tab: Tab = "chat";
  @state() onboarding = resolveOnboardingMode();
  @state() connected = false;
  @state() theme: ThemeMode = this.settings.theme ?? "system";
  @state() themeResolved: ResolvedTheme = "dark";
  @state() hello: GatewayHelloOk | null = null;
  @state() lastError: string | null = null;
  @state() eventLog: EventLogEntry[] = [];
  private eventLogBuffer: EventLogEntry[] = [];
  toolStreamSyncTimer: number | null = null;
  private sidebarCloseTimer: number | null = null;

  @state() assistantName = injectedAssistantIdentity.name;
  @state() assistantAvatar = injectedAssistantIdentity.avatar;
  @state() assistantAgentId = injectedAssistantIdentity.agentId ?? null;

  @state() sessionKey = this.settings.sessionKey;
  @state() threads: Map<string, ThreadState> = new Map();
  @state() activeThreadId: string | null = null;
  sessionKeyToThreadId = new Map<string, string>();
  @state() chatLoading = false;
  @state() chatSending = false;
  @state() chatMessage = "";
  @state() chatMessages: unknown[] = [];
  @state() chatToolMessages: unknown[] = [];
  @state() chatStream: string | null = null;
  @state() chatStreamStartedAt: number | null = null;
  @state() chatRunId: string | null = null;
  @state() compactionStatus: import("./app-tool-stream").CompactionStatus | null = null;
  @state() chatAvatarUrl: string | null = null;
  @state() chatThinkingLevel: string | null = null;
  @state() chatQueue: ChatQueueItem[] = [];
  @state() chatAttachments: ChatAttachment[] = [];
  @state() slashCommands: SlashCommandEntry[] = [];
  /** Session keys that currently have an active agent run (global, across all sessions). */
  @state() runningSessions: Set<string> = new Set();
  /** Active sub-agent runs keyed by requester session key. */
  @state() subagentRuns: Map<string, import("./types").SubagentRunInfo[]> = new Map();
  // Sidebar state for tool output viewing
  @state() sidebarOpen = false;
  @state() sidebarContent: string | null = null;
  @state() sidebarError: string | null = null;
  @state() splitRatio = this.settings.splitRatio;

  // Global artifact panel state (renders to the right of all panes)
  @state() artifactOpen = false;
  @state() artifactTabs: import("./pane-state").ArtifactTab[] = [];
  @state() artifactActiveTabId: string | null = null;
  @state() artifactSplitRatio = 0.65;

  // Coding sessions panel
  @state() codingPanelOpen = false;
  @state() codingSessions: import("./views/coding-panel").CodingSession[] = [];
  @state() codingExpanded: Set<string> = new Set();
  @state() codingSessionEvents: Map<string, import("./views/coding-panel").StreamEvent[]> =
    new Map();
  @state() codingSessionPhases: Map<string, import("./views/coding-panel").Phase> = new Map();
  @state() codingTerminalOpen: string | null = null;
  @state() codingQuestions: Map<string, { question: string; toolUseId: string }> = new Map();
  private codingPollTimer: ReturnType<typeof setInterval> | null = null;
  private codingLogOffsets: Map<string, number> = new Map();
  artifactClosedPaths: Set<string> = new Set();
  private artifactRefreshTimers = new Map<string, ReturnType<typeof setTimeout>>();

  // Split pane layout state
  @state() splitLayout: SplitPaneLayout | null = null;
  @state() focusedPaneId: string | null = null;
  @state() paneStates: Map<string, PaneState> = new Map();
  /** Timer handle for the pending focusPane textarea.focus() call. */
  private _focusPaneTimer: ReturnType<typeof setTimeout> | null = null;
  // URL pane restoration (set by applySettingsFromUrl, consumed by handleConnected)
  urlPanes: { paneKeys: string[]; focusIndex: number } | null = null;

  @state() nodesLoading = false;
  @state() nodes: Array<Record<string, unknown>> = [];
  @state() devicesLoading = false;
  @state() devicesError: string | null = null;
  @state() devicesList: DevicePairingList | null = null;
  @state() execApprovalsLoading = false;
  @state() execApprovalsSaving = false;
  @state() execApprovalsDirty = false;
  @state() execApprovalsSnapshot: ExecApprovalsSnapshot | null = null;
  @state() execApprovalsForm: ExecApprovalsFile | null = null;
  @state() execApprovalsSelectedAgent: string | null = null;
  @state() execApprovalsTarget: "gateway" | "node" = "gateway";
  @state() execApprovalsTargetNodeId: string | null = null;
  @state() execApprovalQueue: ExecApprovalRequest[] = [];
  @state() execApprovalBusy = false;
  @state() execApprovalError: string | null = null;
  @state() toolApprovalQueue: ToolApprovalRequest[] = [];
  @state() toolApprovalBusy = false;
  @state() toolApprovalError: string | null = null;
  @state() pendingGatewayUrl: string | null = null;

  @state() configLoading = false;
  @state() configRaw = "{\n}\n";
  @state() configRawOriginal = "";
  @state() configValid: boolean | null = null;
  @state() configIssues: unknown[] = [];
  @state() configSaving = false;
  @state() configApplying = false;
  @state() updateRunning = false;
  @state() applySessionKey = this.settings.lastActiveSessionKey;
  @state() configSnapshot: ConfigSnapshot | null = null;
  @state() configSchema: unknown | null = null;
  @state() configSchemaVersion: string | null = null;
  @state() configSchemaLoading = false;
  @state() configUiHints: ConfigUiHints = {};
  @state() configForm: Record<string, unknown> | null = null;
  @state() configFormOriginal: Record<string, unknown> | null = null;
  @state() configFormDirty = false;
  @state() configFormMode: "form" | "raw" = "form";
  @state() configSearchQuery = "";
  @state() configActiveSection: string | null = null;
  @state() configActiveSubsection: string | null = null;

  @state() channelsLoading = false;
  @state() channelsSnapshot: ChannelsStatusSnapshot | null = null;
  @state() channelsError: string | null = null;
  @state() channelsLastSuccess: number | null = null;
  @state() whatsappLoginMessage: string | null = null;
  @state() whatsappLoginQrDataUrl: string | null = null;
  @state() whatsappLoginConnected: boolean | null = null;
  @state() whatsappBusy = false;
  @state() nostrProfileFormState: NostrProfileFormState | null = null;
  @state() nostrProfileAccountId: string | null = null;

  @state() presenceLoading = false;
  @state() presenceEntries: PresenceEntry[] = [];
  @state() presenceError: string | null = null;
  @state() presenceStatus: string | null = null;

  @state() agentsLoading = false;
  @state() agentsList: AgentsListResult | null = null;
  @state() agentsError: string | null = null;

  @state() sessionsLoading = false;
  @state() sessionsResult: SessionsListResult | null = null;
  @state() sessionsError: string | null = null;
  @state() sessionsFilterActive = "";
  @state() sessionsFilterLimit = "120";
  @state() sessionsIncludeGlobal = true;
  @state() sessionsIncludeUnknown = false;

  @state() modelsLoading = false;
  @state() modelsList: ModelCatalogEntry[] = [];
  @state() modelsError: string | null = null;
  // Models config page state
  @state() modelsConfig: { providers: import("./views/models").ModelProvider[] } | null = null;
  @state() modelsConfigLoading = false;
  @state() modelsConfigSaving = false;
  @state() modelsConfigError: string | null = null;
  @state() modelsConfigHash: string | null = null;
  @state() visibleModels: string[] = [];

  @state() cronLoading = false;
  @state() cronJobs: CronJob[] = [];
  @state() cronStatus: CronStatus | null = null;
  @state() cronError: string | null = null;
  @state() cronForm: CronFormState = { ...DEFAULT_CRON_FORM };
  @state() cronRunsJobId: string | null = null;
  @state() cronRuns: CronRunLogEntry[] = [];
  @state() cronBusy = false;

  @state() skillsLoading = false;
  @state() skillsReport: SkillStatusReport | null = null;
  @state() skillsError: string | null = null;
  @state() skillsFilter = "";
  @state() skillEdits: Record<string, string> = {};
  @state() skillsBusyKey: string | null = null;
  @state() skillMessages: Record<string, SkillMessage> = {};

  @state() debugLoading = false;
  @state() debugStatus: StatusSummary | null = null;
  @state() debugHealth: HealthSnapshot | null = null;
  @state() debugModels: unknown[] = [];
  @state() debugHeartbeat: unknown | null = null;
  @state() debugCallMethod = "";
  @state() debugCallParams = "{}";
  @state() debugCallResult: string | null = null;
  @state() debugCallError: string | null = null;

  @state() logsLoading = false;
  @state() logsError: string | null = null;
  @state() logsFile: string | null = null;
  @state() logsEntries: LogEntry[] = [];
  @state() logsFilterText = "";
  @state() logsLevelFilters: Record<LogLevel, boolean> = {
    ...DEFAULT_LOG_LEVEL_FILTERS,
  };
  @state() logsAutoFollow = true;
  @state() logsTruncated = false;
  @state() logsCursor: number | null = null;
  @state() logsLastFetchAt: number | null = null;
  @state() logsLimit = 500;
  @state() logsMaxBytes = 250_000;
  @state() logsAtBottom = true;

  @state() gitLoading = false;
  @state() gitError: string | null = null;
  @state() gitBranch = "";
  @state() gitFiles: import("./types").GitFileStatus[] = [];
  @state() gitAhead = 0;
  @state() gitBehind = 0;
  @state() gitLogEntries: import("./types").GitLogEntry[] = [];
  @state() gitLogLoading = false;
  @state() gitDiff: string | null = null;
  @state() gitDiffLoading = false;
  @state() gitCommitMessage = "";
  @state() gitCommitting = false;
  @state() gitSelectedPath: string | null = null;
  @state() gitDiffStaged = false;
  @state() gitStagedCollapsed = false;
  @state() gitChangesCollapsed = false;
  @state() gitLogCollapsed = true;
  @state() gitPanelOpen = false;

  client: GatewayBrowserClient | null = null;
  private chatScrollFrame: number | null = null;
  private chatScrollTimeout: number | null = null;
  private chatHasAutoScrolled = false;
  private chatUserNearBottom = true;
  private chatUserScrolledAway = false;
  nodesPollInterval: number | null = null;
  logsPollInterval: number | null = null;
  debugPollInterval: number | null = null;
  modelsPollInterval: number | null = null;
  private logsScrollFrame: number | null = null;
  toolStreamById = new Map<string, ToolStreamEntry>();
  toolStreamOrder: string[] = [];
  refreshSessionsAfterChat = new Set<string>();
  basePath = "";
  visibilityHandler: (() => void) | null = null;
  private popStateHandler = () =>
    onPopStateInternal(this as unknown as Parameters<typeof onPopStateInternal>[0]);
  private themeMedia: MediaQueryList | null = null;
  private themeMediaHandler: ((event: MediaQueryListEvent) => void) | null = null;
  private topbarObserver: ResizeObserver | null = null;

  createRenderRoot() {
    return this;
  }

  async connectedCallback() {
    super.connectedCallback();
    await handleConnected(this as unknown as Parameters<typeof handleConnected>[0]);
    this.addEventListener("chat-load-more", () => this.requestUpdate());
    // Restore draft + attachments + queue for the active session (survives HMR)
    const draft = loadDraft(this.sessionKey);
    if (draft && !this.chatMessage) {
      this.chatMessage = draft;
    }
    const attachments = loadAttachments(this.sessionKey);
    if (attachments.length && !this.chatAttachments.length) {
      this.chatAttachments = attachments;
    }
    const queue = loadQueue(this.sessionKey);
    if (queue.length && !this.chatQueue.length) {
      this.chatQueue = queue;
    }
  }

  protected firstUpdated() {
    handleFirstUpdated(this as unknown as Parameters<typeof handleFirstUpdated>[0]);
  }

  disconnectedCallback() {
    handleDisconnected(this as unknown as Parameters<typeof handleDisconnected>[0]);
    super.disconnectedCallback();
  }

  protected updated(changed: Map<PropertyKey, unknown>) {
    handleUpdated(this as unknown as Parameters<typeof handleUpdated>[0], changed);
  }

  connect() {
    connectGatewayInternal(this as unknown as Parameters<typeof connectGatewayInternal>[0]);
  }

  handleChatScroll(event: Event) {
    handleChatScrollInternal(
      this as unknown as Parameters<typeof handleChatScrollInternal>[0],
      event,
    );
  }

  handleLogsScroll(event: Event) {
    handleLogsScrollInternal(
      this as unknown as Parameters<typeof handleLogsScrollInternal>[0],
      event,
    );
  }

  exportLogs(lines: string[], label: string) {
    exportLogsInternal(lines, label);
  }

  resetToolStream() {
    resetToolStreamInternal(this as unknown as Parameters<typeof resetToolStreamInternal>[0]);
  }

  resetChatScroll() {
    resetChatScrollInternal(this as unknown as Parameters<typeof resetChatScrollInternal>[0]);
  }

  async loadAssistantIdentity() {
    await loadAssistantIdentityInternal(this);
  }

  applySettings(next: UiSettings) {
    applySettingsInternal(this as unknown as Parameters<typeof applySettingsInternal>[0], next);
  }

  setTab(next: Tab) {
    setTabInternal(this as unknown as Parameters<typeof setTabInternal>[0], next);
  }

  setTheme(next: ThemeMode, context?: Parameters<typeof setThemeInternal>[2]) {
    setThemeInternal(this as unknown as Parameters<typeof setThemeInternal>[0], next, context);
  }

  async loadOverview() {
    await loadOverviewInternal(this as unknown as Parameters<typeof loadOverviewInternal>[0]);
  }

  async loadCron() {
    await loadCronInternal(this as unknown as Parameters<typeof loadCronInternal>[0]);
  }

  async handleAbortChat() {
    await handleAbortChatInternal(this as unknown as Parameters<typeof handleAbortChatInternal>[0]);
  }

  async handleSendChatImmediately() {
    await handleSendChatInternal(
      this as unknown as Parameters<typeof handleSendChatInternal>[0],
      undefined,
      { sendImmediately: true },
    );
  }

  async handleQueueSendNow(id: string) {
    await sendQueuedMessageNowInternal(
      this as unknown as Parameters<typeof sendQueuedMessageNowInternal>[0],
      id,
    );
  }

  async abortThreadRun(sessionKey: string, runId: string): Promise<boolean> {
    if (!this.client || !this.connected) {
      markAbortPending(sessionKey);
      return false;
    }
    try {
      await this.client.request("chat.abort", { sessionKey, runId });
      return true;
    } catch (err) {
      this.lastError = String(err);
      markAbortPending(sessionKey);
      return false;
    }
  }

  removeQueuedMessage(id: string) {
    removeQueuedMessageInternal(
      this as unknown as Parameters<typeof removeQueuedMessageInternal>[0],
      id,
    );
  }

  clearAllQueuedMessages() {
    clearAllQueuedMessagesInternal(
      this as unknown as Parameters<typeof clearAllQueuedMessagesInternal>[0],
    );
  }

  async handleSendChat(
    messageOverride?: string,
    opts?: Parameters<typeof handleSendChatInternal>[2],
  ) {
    await handleSendChatInternal(
      this as unknown as Parameters<typeof handleSendChatInternal>[0],
      messageOverride,
      opts,
    );
  }

  async handleWhatsAppStart(force: boolean) {
    await handleWhatsAppStartInternal(this, force);
  }

  async handleWhatsAppWait() {
    await handleWhatsAppWaitInternal(this);
  }

  async handleWhatsAppLogout() {
    await handleWhatsAppLogoutInternal(this);
  }

  async handleChannelConfigSave() {
    await handleChannelConfigSaveInternal(this);
  }

  async handleChannelConfigReload() {
    await handleChannelConfigReloadInternal(this);
  }

  handleNostrProfileEdit(accountId: string, profile: NostrProfile | null) {
    handleNostrProfileEditInternal(this, accountId, profile);
  }

  handleNostrProfileCancel() {
    handleNostrProfileCancelInternal(this);
  }

  handleNostrProfileFieldChange(field: keyof NostrProfile, value: string) {
    handleNostrProfileFieldChangeInternal(this, field, value);
  }

  async handleNostrProfileSave() {
    await handleNostrProfileSaveInternal(this);
  }

  async handleNostrProfileImport() {
    await handleNostrProfileImportInternal(this);
  }

  handleNostrProfileToggleAdvanced() {
    handleNostrProfileToggleAdvancedInternal(this);
  }

  async handleExecApprovalDecision(decision: "allow-once" | "allow-always" | "deny") {
    const active = this.execApprovalQueue[0];
    if (!active || !this.client || this.execApprovalBusy) return;
    this.execApprovalBusy = true;
    this.execApprovalError = null;
    try {
      await this.client.request("exec.approval.resolve", {
        id: active.id,
        decision,
      });
      this.execApprovalQueue = this.execApprovalQueue.filter((entry) => entry.id !== active.id);
    } catch (err) {
      this.execApprovalError = `Exec approval failed: ${String(err)}`;
    } finally {
      this.execApprovalBusy = false;
    }
  }

  async handleToolApprovalDecision(decision: "allow-once" | "allow-always" | "deny") {
    const active = this.toolApprovalQueue[0];
    if (!active || !this.client || this.toolApprovalBusy) {
      return;
    }
    this.toolApprovalBusy = true;
    this.toolApprovalError = null;
    try {
      await this.client.request("tool.approval.resolve", {
        id: active.id,
        decision,
      });
      this.toolApprovalQueue = this.toolApprovalQueue.filter((entry) => entry.id !== active.id);
    } catch (err) {
      this.toolApprovalError = `Tool approval failed: ${String(err)}`;
    } finally {
      this.toolApprovalBusy = false;
    }
  }

  handleGatewayUrlConfirm() {
    const nextGatewayUrl = this.pendingGatewayUrl;
    if (!nextGatewayUrl) return;
    this.pendingGatewayUrl = null;
    applySettingsInternal(this as unknown as Parameters<typeof applySettingsInternal>[0], {
      ...this.settings,
      gatewayUrl: nextGatewayUrl,
    });
    this.connect();
  }

  handleGatewayUrlCancel() {
    this.pendingGatewayUrl = null;
  }

  // Sidebar handlers for tool output viewing
  handleOpenSidebar(content: string) {
    if (this.sidebarCloseTimer != null) {
      window.clearTimeout(this.sidebarCloseTimer);
      this.sidebarCloseTimer = null;
    }
    this.sidebarContent = content;
    this.sidebarError = null;
    this.sidebarOpen = true;
    scrollAllVisibleChats(this as unknown as Parameters<typeof scrollAllVisibleChats>[0]);
  }

  handleCloseSidebar() {
    this.sidebarOpen = false;
    scrollAllVisibleChats(this as unknown as Parameters<typeof scrollAllVisibleChats>[0]);
    // Clear content after transition
    if (this.sidebarCloseTimer != null) {
      window.clearTimeout(this.sidebarCloseTimer);
    }
    this.sidebarCloseTimer = window.setTimeout(() => {
      if (this.sidebarOpen) return;
      this.sidebarContent = null;
      this.sidebarError = null;
      this.sidebarCloseTimer = null;
    }, 200);
  }

  handleSplitRatioChange(ratio: number) {
    const newRatio = Math.max(0.4, Math.min(0.7, ratio));
    this.splitRatio = newRatio;
    this.applySettings({ ...this.settings, splitRatio: newRatio });
  }

  // ── Global artifact panel handlers ──

  handleOpenFilePreview(filePath: string, manual = false) {
    // Don't auto-reopen paths the user explicitly closed (manual clicks always work)
    if (!manual && this.artifactClosedPaths.has(filePath)) {
      return;
    }

    const existing = this.artifactTabs.find((t) => t.filePath === filePath);
    if (existing) {
      this.artifactActiveTabId = existing.id;
      this.artifactOpen = true;
      scrollAllVisibleChats(this as unknown as Parameters<typeof scrollAllVisibleChats>[0]);
      this.refreshArtifactTab(existing.id);
      return;
    }

    const tabId = `artifact-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const fileName = filePath.split("/").pop() ?? filePath;
    const newTab: ArtifactTab = {
      id: tabId,
      filePath,
      fileName,
      content: null,
      mtime: null,
      loading: true,
      error: null,
    };
    this.artifactTabs = [...this.artifactTabs, newTab];
    this.artifactActiveTabId = tabId;
    this.artifactOpen = true;
    scrollAllVisibleChats(this as unknown as Parameters<typeof scrollAllVisibleChats>[0]);
    this.refreshArtifactTab(tabId);
  }

  handleArtifactTabSelect(tabId: string) {
    this.artifactActiveTabId = tabId;
  }

  handleArtifactTabClose(tabId: string) {
    const tab = this.artifactTabs.find((t) => t.id === tabId);
    if (tab?.filePath) {
      this.artifactClosedPaths.add(tab.filePath);
    }
    this.artifactTabs = this.artifactTabs.filter((t) => t.id !== tabId);
    if (this.artifactActiveTabId === tabId) {
      this.artifactActiveTabId = this.artifactTabs[this.artifactTabs.length - 1]?.id ?? null;
    }
    if (this.artifactTabs.length === 0) {
      this.artifactOpen = false;
      scrollAllVisibleChats(this as unknown as Parameters<typeof scrollAllVisibleChats>[0]);
    }
  }

  handleArtifactRefresh(tabId: string) {
    this.refreshArtifactTab(tabId);
  }

  handleArtifactClose() {
    this.artifactOpen = false;
    scrollAllVisibleChats(this as unknown as Parameters<typeof scrollAllVisibleChats>[0]);
  }

  // ── Coding Sessions Panel ──

  toggleCodingPanel() {
    this.codingPanelOpen = !this.codingPanelOpen;
    if (this.codingPanelOpen) {
      void this.fetchCodingSessions();
      this.startCodingPoll();
    } else {
      this.stopCodingPoll();
      this.codingTerminalOpen = null;
    }
  }

  private get codingBaseUrl() {
    return (
      this.settings.gatewayUrl?.replace(/^ws/, "http") || `${location.protocol}//${location.host}`
    );
  }

  async fetchCodingSessions() {
    try {
      const res = await fetch(`${this.codingBaseUrl}/api/coding-sessions`);
      if (res.ok) {
        const data = await res.json();
        this.codingSessions = data.sessions || [];
        // Fetch logs for all active or expanded sessions
        for (const s of this.codingSessions) {
          if (
            s.execSessionId &&
            (s.status === "running" ||
              s.status === "starting" ||
              this.codingExpanded.has(s.id) ||
              this.codingTerminalOpen === s.id)
          ) {
            void this.fetchCodingLog(s.id);
          }
        }
      }
    } catch {
      /* silent */
    }
  }

  async fetchCodingLog(id: string) {
    try {
      const offset = this.codingLogOffsets.get(id) || 0;
      const res = await fetch(
        `${this.codingBaseUrl}/api/coding-sessions/${id}/log?offset=${offset}&limit=200`,
      );
      if (!res.ok) return;
      const data = await res.json();
      if (!data.lines && data.totalLines === 0) return;

      // Parse new events from the raw lines
      const newEvents = parseStreamEvents(data.lines);

      if (newEvents.length > 0) {
        const existing = this.codingSessionEvents.get(id) || [];
        const combined = [...existing, ...newEvents];
        // Keep last 500 events max
        const trimmed = combined.length > 500 ? combined.slice(-500) : combined;

        const nextEvents = new Map(this.codingSessionEvents);
        nextEvents.set(id, trimmed);
        this.codingSessionEvents = nextEvents;

        const nextPhases = new Map(this.codingSessionPhases);
        nextPhases.set(id, detectCurrentPhase(trimmed));
        this.codingSessionPhases = nextPhases;

        // Detect pending questions (AskUserQuestion tool calls)
        const lastQuestion = [...newEvents]
          .reverse()
          .find((e) => e.type === "question" && e.question);
        const nextQuestions = new Map(this.codingQuestions);
        if (lastQuestion?.question && lastQuestion?.toolUseId) {
          nextQuestions.set(id, {
            question: lastQuestion.question,
            toolUseId: lastQuestion.toolUseId,
          });
        }
        this.codingQuestions = nextQuestions;
      }

      // Update offset to fetch only new lines next time
      if (data.totalLines > 0) {
        this.codingLogOffsets.set(id, data.totalLines);
      }
    } catch {
      /* silent */
    }
  }

  startCodingPoll() {
    this.stopCodingPoll();
    this.codingPollTimer = setInterval(() => void this.fetchCodingSessions(), 2000);
  }

  stopCodingPoll() {
    if (this.codingPollTimer) {
      clearInterval(this.codingPollTimer);
      this.codingPollTimer = null;
    }
  }

  handleCodingToggleExpand(id: string) {
    const next = new Set(this.codingExpanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.codingExpanded = next;
    // Immediately fetch log when expanding
    if (next.has(id)) void this.fetchCodingLog(id);
  }

  async handleCodingKill(id: string) {
    try {
      await fetch(`${this.codingBaseUrl}/api/coding-sessions/${id}/kill`, { method: "POST" });
      void this.fetchCodingSessions();
    } catch {}
  }

  async handleCodingDismiss(id: string) {
    try {
      await fetch(`${this.codingBaseUrl}/api/coding-sessions/${id}/dismiss`, { method: "POST" });
      void this.fetchCodingSessions();
    } catch {}
  }

  handleOpenCodingTerminal(id: string) {
    this.codingTerminalOpen = id;
    void this.fetchCodingLog(id);
  }

  handleCloseCodingTerminal() {
    this.codingTerminalOpen = null;
  }

  async handleAttachCodingTerminal(id: string) {
    try {
      await fetch(`${this.codingBaseUrl}/api/coding-sessions/${id}/terminal`, { method: "POST" });
    } catch {}
  }

  async handleCodingRespond(id: string, text: string, toolUseId?: string) {
    try {
      await fetch(`${this.codingBaseUrl}/api/coding-sessions/${id}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, toolUseId }),
      });
      // Clear the pending question
      const next = new Map(this.codingQuestions);
      next.delete(id);
      this.codingQuestions = next;
    } catch {}
  }

  handleArtifactToggleRaw(tabId: string) {
    const tab = this.artifactTabs.find((t) => t.id === tabId);
    if (!tab) {
      return;
    }
    const isMd = tab.fileName.endsWith(".md") || tab.fileName.endsWith(".mdx");
    if (isMd) {
      // For markdown: toggle between rendered → editing → rendered
      if (tab.editing) {
        // Cancel editing
        tab.editing = false;
        tab.editDraft = undefined;
      } else {
        // Enter edit mode
        tab.editing = true;
        tab.editDraft = tab.content ?? "";
      }
    } else {
      tab.showRaw = !tab.showRaw;
    }
    this.artifactTabs = [...this.artifactTabs];
  }

  private artifactAutoSaveTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  /** Called on every editor-update event. Debounces and auto-saves. */
  handleArtifactAutoSave(tabId: string, content: string) {
    const tab = this.artifactTabs.find((t) => t.id === tabId);
    if (!tab) {
      return;
    }
    (tab as ArtifactTab & { editDraft?: string }).editDraft = content;

    // Clear existing timer
    const existing = this.artifactAutoSaveTimers.get(tabId);
    if (existing) {
      clearTimeout(existing);
    }

    // Debounce 1.5s then save
    this.artifactAutoSaveTimers.set(
      tabId,
      setTimeout(() => {
        this.artifactAutoSaveTimers.delete(tabId);
        this.handleArtifactSave(tabId, content);
      }, 1500),
    );
  }

  handleArtifactSave(tabId: string, content: string) {
    const tab = this.artifactTabs.find((t) => t.id === tabId);
    if (!tab) {
      return;
    }
    // Skip save if content hasn't changed
    if (content === tab.content) {
      return;
    }

    tab.saving = true;
    this.artifactTabs = [...this.artifactTabs];

    void import("./controllers/file").then(({ writeFileContent }) =>
      writeFileContent(this.basePath, tab.filePath, content, this.password)
        .then((result) => {
          const t = this.artifactTabs.find((t) => t.id === tabId);
          if (!t) {
            return;
          }
          t.content = content;
          t.mtime = result.mtime;
          t.saving = false;
          this.artifactTabs = [...this.artifactTabs];
        })
        .catch((err: Error) => {
          const t = this.artifactTabs.find((t) => t.id === tabId);
          if (!t) {
            return;
          }
          t.saving = false;
          t.error = err.message;
          this.artifactTabs = [...this.artifactTabs];
        }),
    );
  }

  handleArtifactCopy(tabId: string) {
    const tab = this.artifactTabs.find((t) => t.id === tabId);
    if (tab?.content) {
      navigator.clipboard.writeText(tab.content).catch(() => {});
    }
  }

  /** Reset closed-paths set (call on new user message so auto-open works again). */
  resetArtifactClosedPaths() {
    this.artifactClosedPaths.clear();
  }

  private refreshArtifactTab(tabId: string) {
    // Debounce: 300ms per tab to handle rapid Write/Edit calls
    const existing = this.artifactRefreshTimers.get(tabId);
    if (existing) {
      clearTimeout(existing);
    }

    this.artifactRefreshTimers.set(
      tabId,
      setTimeout(() => {
        this.artifactRefreshTimers.delete(tabId);
        void this.doRefreshArtifactTab(tabId);
      }, 300),
    );
  }

  private async doRefreshArtifactTab(tabId: string) {
    const tab = this.artifactTabs.find((t) => t.id === tabId);
    if (!tab || tab.isLegacy) {
      return;
    }

    // Set loading
    tab.loading = true;
    tab.error = null;
    this.artifactTabs = [...this.artifactTabs];

    try {
      const result = await fetchFileContent(this.basePath, tab.filePath, this.password);
      const t = this.artifactTabs.find((t) => t.id === tabId);
      if (!t) {
        return;
      } // tab was closed during fetch
      t.content = result.content;
      t.mtime = result.mtime;
      t.loading = false;
      t.error = null;
      t.updated = true;
      // Auto-enter edit mode for markdown files
      const isMd = t.fileName.endsWith(".md") || t.fileName.endsWith(".mdx");
      if (isMd && !t.editing) {
        t.editing = true;
        t.editDraft = result.content;
      }
      this.artifactTabs = [...this.artifactTabs];
      // Clear updated flash after 1.5s
      setTimeout(() => {
        const t2 = this.artifactTabs.find((t) => t.id === tabId);
        if (t2) {
          t2.updated = false;
          this.artifactTabs = [...this.artifactTabs];
        }
      }, 1500);
    } catch (err: unknown) {
      const t = this.artifactTabs.find((t) => t.id === tabId);
      if (!t) {
        return;
      }
      t.loading = false;
      t.error = err instanceof Error ? err.message : String(err);
      this.artifactTabs = [...this.artifactTabs];
    }
  }

  switchThread(threadId: string) {
    if (threadId === this.activeThreadId) {
      return;
    }
    const nextThread = this.threads.get(threadId);
    if (!nextThread) {
      return;
    }

    // Save current active thread state
    const currentId = this.activeThreadId;
    if (currentId) {
      const current = this.threads.get(currentId);
      if (current) {
        const snap = snapshotThreadState(this);
        Object.assign(current, snap);
        current.descriptor.lastActivityAt = Date.now();
      }
    }

    // Switch
    this.activeThreadId = threadId;
    this.sessionKey = nextThread.descriptor.sessionKey;

    // Restore new thread state
    restoreThreadState(this, nextThread);
    nextThread.unreadCount = 0;
    nextThread.hasNewMessages = false;

    // Reset tool stream and reload history
    resetToolStreamFn(this as unknown as Parameters<typeof resetToolStreamFn>[0]);
    this.resetChatScroll();
    void loadChatHistory(this as unknown as Parameters<typeof loadChatHistory>[0]).then(() => {
      // Flush queued messages — if this thread's run completed while it was
      // in the background, its queue was never flushed (the background handler
      // clears chatRunId but doesn't trigger a flush).
      void flushChatQueueForEvent(this as unknown as Parameters<typeof flushChatQueueForEvent>[0]);
    });

    // Persist active thread
    this.applySettings({
      ...this.settings,
      sessionKey: nextThread.descriptor.sessionKey,
      lastActiveSessionKey: nextThread.descriptor.sessionKey,
      lastActiveThreadId: threadId,
    });

    // Trigger re-render of thread list
    this.threads = new Map(this.threads);
  }

  createThread(label?: string) {
    // Resolve parent session key from the main thread or current session
    const mainThread = this.activeThreadId ? this.threads.get(this.activeThreadId) : null;
    const parentKey = mainThread?.descriptor.parentSessionKey || this.sessionKey;

    const descriptor = createThreadDescriptor(parentKey, label);
    const thread = createThreadState(descriptor);
    this.threads.set(descriptor.id, thread);
    this.sessionKeyToThreadId.set(descriptor.sessionKey, descriptor.id);

    // Persist descriptors
    saveThreadDescriptors(this.getThreadDescriptors());

    // Switch to the new thread
    this.switchThread(descriptor.id);
  }

  deleteThread(threadId: string) {
    if (!this.threads.has(threadId)) {
      return;
    }
    if (this.threads.size <= 1) {
      return;
    } // keep at least one

    const thread = this.threads.get(threadId)!;
    this.threads.delete(threadId);
    this.sessionKeyToThreadId.delete(thread.descriptor.sessionKey);

    // If deleting active, switch to another
    if (threadId === this.activeThreadId) {
      const remaining = Array.from(this.threads.values());
      remaining.sort((a, b) => b.descriptor.lastActivityAt - a.descriptor.lastActivityAt);
      this.switchThread(remaining[0].descriptor.id);
    }

    // Persist
    saveThreadDescriptors(this.getThreadDescriptors());
    this.threads = new Map(this.threads);
  }

  renameThread(threadId: string, label: string) {
    const thread = this.threads.get(threadId);
    if (!thread) {
      return;
    }
    thread.descriptor.label = label;
    saveThreadDescriptors(this.getThreadDescriptors());
    this.threads = new Map(this.threads);
  }

  getThreadDescriptors(): ThreadDescriptor[] {
    return Array.from(this.threads.values())
      .map((t) => t.descriptor)
      .toSorted((a, b) => b.lastActivityAt - a.lastActivityAt);
  }

  initThreadsFromStorage() {
    const saved = loadThreadDescriptors();
    if (saved.length > 0) {
      for (const desc of saved) {
        const thread = createThreadState(desc);
        // Restore draft text + attachments + queue that survived HMR / page reload
        const draft = loadDraft(desc.sessionKey);
        if (draft) {
          thread.chatMessage = draft;
        }
        const attachments = loadAttachments(desc.sessionKey);
        if (attachments.length) {
          thread.chatAttachments = attachments;
        }
        const savedQueue = loadQueue(desc.sessionKey);
        if (savedQueue.length) {
          thread.chatQueue = savedQueue;
        }
        this.threads.set(desc.id, thread);
        this.sessionKeyToThreadId.set(desc.sessionKey, desc.id);
      }
      const lastId = this.settings.lastActiveThreadId;
      this.activeThreadId = lastId && this.threads.has(lastId) ? lastId : saved[0].id;
      // Sync host sessionKey to match the active thread so that
      // loadChatHistory fetches the correct session after reconnect/HMR.
      // Only override if the URL didn't explicitly set a session key
      // (applySettingsFromUrl runs before this, so check for ?session= param).
      const urlHasExplicitSession = new URLSearchParams(window.location.search).has("session");
      if (!urlHasExplicitSession) {
        const activeThread = this.threads.get(this.activeThreadId);
        if (activeThread) {
          this.sessionKey = activeThread.descriptor.sessionKey;
        }
      }
    }
  }

  initDefaultThread() {
    if (this.threads.size > 0) {
      return;
    }
    const descriptor: ThreadDescriptor = {
      id: "main-thread",
      sessionKey: this.sessionKey,
      label: "Main",
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      parentSessionKey: this.sessionKey,
    };
    const thread = createThreadState(descriptor);
    this.threads.set(descriptor.id, thread);
    this.sessionKeyToThreadId.set(descriptor.sessionKey, descriptor.id);
    this.activeThreadId = descriptor.id;
    saveThreadDescriptors(this.getThreadDescriptors());
  }

  // -- Split pane management ------------------------------------------------

  splitPane(direction: "horizontal" | "vertical") {
    const currentSessionKey = this.sessionKey;

    // Ensure the current session has a ThreadState so focus-switching can
    // snapshot/restore its data. Without this, the snapshot silently fails
    // and the pane's content is lost when focus moves away.
    if (!this.sessionKeyToThreadId.has(currentSessionKey)) {
      const mainDesc: ThreadDescriptor = {
        id: `main-thread`,
        sessionKey: currentSessionKey,
        label: "Main",
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
        parentSessionKey: currentSessionKey,
      };
      const mainThread = createThreadState(mainDesc);
      // Snapshot current live state into the new ThreadState immediately
      Object.assign(mainThread, snapshotThreadState(this));
      this.threads.set(mainDesc.id, mainThread);
      this.sessionKeyToThreadId.set(mainDesc.sessionKey, mainDesc.id);
      if (!this.activeThreadId) {
        this.activeThreadId = mainDesc.id;
      }
    }

    // Create a fresh thread for the new pane (without switching to it)
    const parentKey =
      (this.activeThreadId
        ? this.threads.get(this.activeThreadId)?.descriptor.parentSessionKey
        : null) || this.sessionKey;
    const newDescriptor = createThreadDescriptor(parentKey);
    const newThread = createThreadState(newDescriptor);
    this.threads.set(newDescriptor.id, newThread);
    this.sessionKeyToThreadId.set(newDescriptor.sessionKey, newDescriptor.id);
    saveThreadDescriptors(this.getThreadDescriptors());
    this.threads = new Map(this.threads);

    let newPaneId: string;

    if (!this.splitLayout) {
      // Enter split mode: wrap current chat in a layout
      const firstLeaf = createLeaf(currentSessionKey, "pane-initial");
      const secondLeaf = createLeaf(newDescriptor.sessionKey);
      newPaneId = secondLeaf.id;
      this.splitLayout = {
        root: {
          kind: "branch",
          id: `branch-${Date.now()}`,
          direction,
          ratio: 0.5,
          first: firstLeaf,
          second: secondLeaf,
        },
        // Start with the existing pane focused (matches current sessionKey)
        focusedPaneId: firstLeaf.id,
      };
      this.focusedPaneId = firstLeaf.id;
    } else {
      // Split the focused pane
      const targetId = this.focusedPaneId ?? allLeafIds(this.splitLayout.root)[0];
      if (!targetId) {
        return;
      }
      const newRoot = splitLeafTree(
        this.splitLayout.root,
        targetId,
        direction,
        newDescriptor.sessionKey,
      );
      // Find the newly created leaf (the second child of the new branch)
      const newLeaves = allLeaves(newRoot);
      const oldIds = new Set(allLeafIds(this.splitLayout.root));
      const newLeaf = newLeaves.find((l) => !oldIds.has(l.id));
      newPaneId = newLeaf?.id ?? targetId;
      this.splitLayout = {
        root: newRoot,
        focusedPaneId: this.focusedPaneId ?? targetId,
      };
    }
    this.syncPaneStatesFromLayout();
    this.persistSplitLayout();
    this.syncUrlWithPanes(false);
    scrollAllVisibleChats(this as unknown as Parameters<typeof scrollAllVisibleChats>[0]);
    // Focus the new pane — this snapshots current thread & restores the new one.
    // focusPane already schedules a managed textarea.focus() timer, so no
    // duplicate setTimeout here (that was the second source of stale timers).
    this.focusPane(newPaneId);
    this.resetChatScroll();
  }

  async closePane(paneId?: string) {
    if (!this.splitLayout) {
      return;
    }
    const targetId = paneId ?? this.focusedPaneId ?? allLeafIds(this.splitLayout.root)[0];
    if (!targetId) {
      return;
    }

    // Clean up empty auto-created thread for the closing pane
    const closedLeaf = findLeaf(this.splitLayout.root, targetId);
    if (closedLeaf) {
      const closedMapId = this.sessionKeyToThreadId.get(closedLeaf.threadId);
      if (closedMapId && closedMapId !== "main-thread") {
        const closedThread = this.threads.get(closedMapId);
        if (closedThread && closedThread.chatMessages.length === 0) {
          this.threads.delete(closedMapId);
          this.sessionKeyToThreadId.delete(closedLeaf.threadId);
          saveThreadDescriptors(this.getThreadDescriptors());
          this.threads = new Map(this.threads);
        }
      }
    }

    const newRoot = removeLeafTree(this.splitLayout.root, targetId);
    if (!newRoot) {
      // Tree is empty - create a single leaf with current session
      const { createLeaf } = await import("./split-tree.js");
      const leaf = createLeaf(this.sessionKey, "pane-initial");
      this.splitLayout = {
        root: leaf,
        focusedPaneId: leaf.id,
      };
      this.focusedPaneId = leaf.id;
      this.syncPaneStatesFromLayout();
      this.persistSplitLayout();
      this.syncUrlWithPanes(false);
      scrollAllVisibleChats(this as unknown as Parameters<typeof scrollAllVisibleChats>[0]);
      return;
    }

    if (newRoot.kind === "leaf") {
      // Only one pane left - keep it as single-leaf layout
      this.sessionKey = newRoot.threadId;
      this.splitLayout = {
        root: newRoot,
        focusedPaneId: newRoot.id,
      };
      this.focusedPaneId = newRoot.id;
      // Restore the remaining thread's state
      const remainingId = this.sessionKeyToThreadId.get(newRoot.threadId);
      if (remainingId) {
        const remainingThread = this.threads.get(remainingId);
        if (remainingThread) {
          restoreThreadState(this, remainingThread);
        }
      }
      this.syncPaneStatesFromLayout();
      this.persistSplitLayout();
      this.syncUrlWithPanes(false);
      scrollAllVisibleChats(this as unknown as Parameters<typeof scrollAllVisibleChats>[0]);
      return;
    }

    // Move focus to an adjacent pane
    const remainingIds = allLeafIds(newRoot);
    const newFocus = remainingIds.includes(this.focusedPaneId ?? "")
      ? this.focusedPaneId!
      : remainingIds[0];
    this.splitLayout = { root: newRoot, focusedPaneId: newFocus };
    this.focusedPaneId = newFocus;

    // Restore the newly focused pane's thread
    const focusLeaf = findLeaf(newRoot, newFocus);
    if (focusLeaf && focusLeaf.threadId !== this.sessionKey) {
      // Snapshot current state first — ensure ThreadState exists
      let prevId = this.sessionKeyToThreadId.get(this.sessionKey);
      if (!prevId) {
        const desc: ThreadDescriptor = {
          id: `pane-snap-${Date.now()}`,
          sessionKey: this.sessionKey,
          label: "",
          createdAt: Date.now(),
          lastActivityAt: Date.now(),
          parentSessionKey: this.sessionKey.split(":thread:")[0] || this.sessionKey,
        };
        const newThread = createThreadState(desc);
        this.threads.set(desc.id, newThread);
        this.sessionKeyToThreadId.set(desc.sessionKey, desc.id);
        prevId = desc.id;
      }
      const prevThread = this.threads.get(prevId);
      if (prevThread) {
        Object.assign(prevThread, snapshotThreadState(this));
      }
      this.sessionKey = focusLeaf.threadId;
      const targetId2 = this.sessionKeyToThreadId.get(focusLeaf.threadId);
      if (targetId2) {
        const targetThread = this.threads.get(targetId2);
        if (targetThread) {
          restoreThreadState(this, targetThread);
        }
      }
    }

    this.syncPaneStatesFromLayout();
    this.persistSplitLayout();
    this.syncUrlWithPanes(false);
    scrollAllVisibleChats(this as unknown as Parameters<typeof scrollAllVisibleChats>[0]);
  }

  focusPane(paneId: string) {
    // Guard: no-op if this pane is already focused — avoids redundant
    // re-renders and the uncancelled-setTimeout cascade that causes
    // infinite focus ping-pong between panes.
    if (paneId === this.focusedPaneId) {
      return;
    }

    const switching = this.focusedPaneId !== null;

    this.focusedPaneId = paneId;
    if (this.splitLayout) {
      this.splitLayout = { ...this.splitLayout, focusedPaneId: paneId };
    }

    const leaf = this.splitLayout ? findLeaf(this.splitLayout.root, paneId) : null;
    if (!leaf) {
      return;
    }

    // Snapshot current thread's live state before switching
    if (switching) {
      let prevThreadId = this.sessionKeyToThreadId.get(this.sessionKey);
      // Ensure a ThreadState exists for the current session so snapshot has a target
      if (!prevThreadId) {
        const desc: ThreadDescriptor = {
          id: `pane-snap-${Date.now()}`,
          sessionKey: this.sessionKey,
          label: "",
          createdAt: Date.now(),
          lastActivityAt: Date.now(),
          parentSessionKey: this.sessionKey.split(":thread:")[0] || this.sessionKey,
        };
        const newThread = createThreadState(desc);
        this.threads.set(desc.id, newThread);
        this.sessionKeyToThreadId.set(desc.sessionKey, desc.id);
        prevThreadId = desc.id;
      }
      const prevThread = this.threads.get(prevThreadId);
      if (prevThread) {
        Object.assign(prevThread, snapshotThreadState(this));
      }
      // Trigger Lit reactivity so the non-active pane re-renders with stored data
      this.threads = new Map(this.threads);
    }

    // Switch session and restore target thread's state
    if (leaf.threadId !== this.sessionKey) {
      this.sessionKey = leaf.threadId;
      const targetThreadId = this.sessionKeyToThreadId.get(leaf.threadId);
      if (targetThreadId) {
        const targetThread = this.threads.get(targetThreadId);
        if (targetThread) {
          restoreThreadState(this, targetThread);

          // Bug 4 guard: if the target thread has an in-flight history load,
          // re-restore once it completes so the host sees fresh data.
          if (targetThread._historyLoading) {
            const capturedPaneId = paneId;
            const poll = () => {
              if (!targetThread._historyLoading) {
                // Only apply if this pane is still focused (user didn't switch again)
                if (this.focusedPaneId === capturedPaneId) {
                  restoreThreadState(this, targetThread);
                  this.threads = new Map(this.threads);
                }
              } else {
                setTimeout(poll, 50);
              }
            };
            setTimeout(poll, 50);
          }
        }
      }
    }

    // replaceState — focus change is minor, not a meaningful navigation
    this.syncUrlWithPanes(true);
    // Persist so HMR / reload restores the correct focused pane
    this.persistSplitLayout();

    // Cancel any pending focus timer from a previous focusPane call —
    // without this, stale timers fire and force focus to the wrong pane,
    // which triggers @focusin → focusPane → new timer → infinite loop.
    if (this._focusPaneTimer != null) {
      clearTimeout(this._focusPaneTimer);
      this._focusPaneTimer = null;
    }

    // Auto-focus the composer textarea in the newly focused pane
    this._focusPaneTimer = setTimeout(() => {
      this._focusPaneTimer = null;
      // Stale-check: if focus moved elsewhere before this timer fired, bail.
      if (this.focusedPaneId !== paneId) {
        return;
      }
      // Don't steal focus if user is selecting text (e.g. copy-paste from messages)
      const sel = window.getSelection();
      if (sel && sel.toString().length > 0) {
        return;
      }
      const paneEl = document.querySelector(`.split-pane[data-pane-id="${paneId}"]`);
      const textarea = paneEl?.querySelector<HTMLTextAreaElement>(".chat-compose textarea");
      if (textarea && !textarea.disabled) {
        textarea.focus();
      }
    }, 50);
  }

  setThreadInPane(paneId: string, threadId: string) {
    if (!this.splitLayout) {
      return;
    }

    // Prevent duplicate: if thread is already in another pane, focus it instead
    const existingLeaf = allLeaves(this.splitLayout.root).find(
      (l) => l.threadId === threadId && l.id !== paneId,
    );
    if (existingLeaf) {
      this.focusPane(existingLeaf.id);
      return;
    }

    // Clean up the old thread if it was an empty auto-created one
    const oldLeaf = findLeaf(this.splitLayout.root, paneId);
    if (oldLeaf && oldLeaf.threadId !== threadId) {
      const oldMapId = this.sessionKeyToThreadId.get(oldLeaf.threadId);
      if (oldMapId && oldMapId !== "main-thread") {
        const oldThread = this.threads.get(oldMapId);
        if (oldThread && oldThread.chatMessages.length === 0) {
          this.threads.delete(oldMapId);
          this.sessionKeyToThreadId.delete(oldLeaf.threadId);
          saveThreadDescriptors(this.getThreadDescriptors());
          this.threads = new Map(this.threads);
        }
      }
    }

    // Ensure a ThreadState exists for the new session key
    if (!this.sessionKeyToThreadId.has(threadId)) {
      const desc: ThreadDescriptor = {
        id: `pane-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        sessionKey: threadId,
        label: "",
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
        parentSessionKey: threadId.split(":thread:")[0] || threadId,
      };
      const newThread = createThreadState(desc);
      this.threads.set(desc.id, newThread);
      this.sessionKeyToThreadId.set(desc.sessionKey, desc.id);
    }

    const newRoot = setLeafThread(this.splitLayout.root, paneId, threadId);
    this.splitLayout = { ...this.splitLayout, root: newRoot };
    this.syncPaneStatesFromLayout();
    this.persistSplitLayout();
    this.syncUrlWithPanes(false);

    // Load history for the newly assigned session so the pane isn't left empty
    const mapId = this.sessionKeyToThreadId.get(threadId);
    const thread = mapId ? this.threads.get(mapId) : null;
    if (thread && thread.chatMessages.length === 0 && this.client && this.connected) {
      void (async () => {
        try {
          const res = await this.client!.request("chat.history", {
            sessionKey: threadId,
            limit: 200,
          });
          thread.chatMessages = Array.isArray(res.messages) ? res.messages : [];
          thread.chatThinkingLevel = res.thinkingLevel ?? null;
          this.threads = new Map(this.threads);
        } catch {
          /* non-critical */
        }
      })();
    }
  }

  swapPanes(paneIdA: string, paneIdB: string) {
    if (!this.splitLayout || paneIdA === paneIdB) {
      return;
    }
    const newRoot = swapLeafThreads(this.splitLayout.root, paneIdA, paneIdB);
    this.splitLayout = { ...this.splitLayout, root: newRoot };
    this.syncPaneStatesFromLayout();
    this.persistSplitLayout();
    this.syncUrlWithPanes(false);
  }

  movePaneBeside(
    sourcePaneId: string,
    targetPaneId: string,
    direction: SplitDirection,
    position: "before" | "after",
  ) {
    if (!this.splitLayout || sourcePaneId === targetPaneId) {
      return;
    }
    const newRoot = moveLeafBeside(
      this.splitLayout.root,
      sourcePaneId,
      targetPaneId,
      direction,
      position,
    );
    if (!newRoot) {
      return;
    }
    this.splitLayout = { ...this.splitLayout, root: newRoot };
    this.syncPaneStatesFromLayout();
    this.persistSplitLayout();
    this.syncUrlWithPanes(false);
  }

  handleSplitBranchResize(branchId: string, ratio: number) {
    if (!this.splitLayout) {
      return;
    }
    const newRoot = updateBranchRatio(this.splitLayout.root, branchId, ratio);
    this.splitLayout = { ...this.splitLayout, root: newRoot };
    this.persistSplitLayout();
    scrollAllVisibleChats(this as unknown as Parameters<typeof scrollAllVisibleChats>[0]);
  }

  focusNextPane() {
    if (!this.splitLayout || !this.focusedPaneId) {
      return;
    }
    const next = nextLeafId(this.splitLayout.root, this.focusedPaneId);
    if (next) {
      this.focusPane(next);
    }
  }

  toggleNav() {
    this.applySettings({
      ...this.settings,
      navCollapsed: !this.settings.navCollapsed,
    });
    scrollAllVisibleChats(this as unknown as Parameters<typeof scrollAllVisibleChats>[0]);
  }

  toggleGitPanel() {
    this.gitPanelOpen = !this.gitPanelOpen;
  }

  archiveCurrentSession() {
    const key = this.sessionKey;
    if (!key) {
      return;
    }
    void patchSession(this as unknown, key, { archived: true });
    // Close the pane in split mode
    if (this.splitLayout) {
      const leaf = allLeaves(this.splitLayout.root).find((l) => l.threadId === key);
      if (leaf) {
        this.closePane(leaf.id);
      }
    }
    // Start a fresh session
    this.createThread();
  }

  syncPaneStatesFromLayout() {
    if (!this.splitLayout) {
      this.paneStates = new Map();
      return;
    }
    const leaves = allLeaves(this.splitLayout.root);
    const entries = leaves.map((l) => ({ paneId: l.id, threadId: l.threadId }));
    this.paneStates = syncPaneStates(this.paneStates, entries);
  }

  private persistSplitLayout() {
    const serialized = this.splitLayout ? serializeLayout(this.splitLayout) : null;
    this.applySettings({ ...this.settings, splitLayout: serialized });
  }

  syncUrlWithPanes(replace: boolean) {
    syncUrlWithPanesInternal(
      this as unknown as Parameters<typeof syncUrlWithPanesInternal>[0],
      replace,
    );
  }

  async exitSplitMode() {
    // Instead of clearing layout, collapse to single leaf with current session
    const { createLeaf } = await import("./split-tree.js");
    const leaf = createLeaf(this.sessionKey, "pane-initial");
    this.splitLayout = {
      root: leaf,
      focusedPaneId: leaf.id,
    };
    this.focusedPaneId = leaf.id;
    this.syncPaneStatesFromLayout();
    this.persistSplitLayout();
    this.syncUrlWithPanes(false);
  }

  restoreSplitLayout() {
    const raw = this.settings.splitLayout;
    if (!raw) {
      return;
    }
    const layout = deserializeLayout(raw);
    if (!layout) {
      return;
    }
    // Validate that referenced session keys are accessible
    this.splitLayout = layout;
    this.focusedPaneId = layout.focusedPaneId;
    this.syncPaneStatesFromLayout();

    // Restore the focused pane's session key so the live state (chatMessage,
    // chatMessages, etc.) targets the correct pane after HMR / page reload.
    if (layout.focusedPaneId) {
      const focusedLeaf = findLeaf(layout.root, layout.focusedPaneId);
      if (focusedLeaf && focusedLeaf.threadId !== this.sessionKey) {
        this.sessionKey = focusedLeaf.threadId;
        const threadId = this.sessionKeyToThreadId.get(focusedLeaf.threadId);
        if (threadId) {
          const thread = this.threads.get(threadId);
          if (thread) {
            restoreThreadState(this, thread);
          }
        }
      }
    }
  }

  // -- Terminal pane management -----------------------------------------------

  /** Open a terminal in the focused pane (split if in chat, or create new pane). */
  async openTerminalPane() {
    const terminalId = await this._createTerminalSession();
    if (!terminalId) {
      return;
    }

    if (!this.splitLayout) {
      // Create initial layout with the terminal
      const leaf = createTerminalLeaf(terminalId, "pane-initial");
      this.splitLayout = {
        root: leaf,
        focusedPaneId: leaf.id,
      };
      this.focusedPaneId = leaf.id;
      this.syncPaneStatesFromLayout();
      this.persistSplitLayout();
      return;
    }

    // Replace the focused pane's content with a terminal if it's empty,
    // otherwise split to add a new terminal pane
    const focusedId = this.focusedPaneId ?? allLeafIds(this.splitLayout.root)[0];
    if (!focusedId) {
      return;
    }

    const focusedLeaf = findLeaf(this.splitLayout.root, focusedId);
    if (focusedLeaf && focusedLeaf.paneType !== "terminal") {
      // Split horizontally to add terminal beside current pane
      const newRoot = splitLeafWithTerminal(
        this.splitLayout.root,
        focusedId,
        "horizontal",
        terminalId,
      );
      const newLeaves = allLeaves(newRoot);
      const oldIds = new Set(allLeafIds(this.splitLayout.root));
      const newLeaf = newLeaves.find((l) => !oldIds.has(l.id));
      this.splitLayout = {
        root: newRoot,
        focusedPaneId: newLeaf?.id ?? focusedId,
      };
      this.focusedPaneId = newLeaf?.id ?? focusedId;
    }

    this.syncPaneStatesFromLayout();
    this.persistSplitLayout();
  }

  /** Open a terminal pane via split (beside the focused pane). */
  async openTerminalInSplit(direction: "horizontal" | "vertical") {
    const terminalId = await this._createTerminalSession();
    if (!terminalId) {
      return;
    }

    if (!this.splitLayout) {
      // Create initial layout with single terminal
      const leaf = createTerminalLeaf(terminalId, "pane-initial");
      this.splitLayout = {
        root: leaf,
        focusedPaneId: leaf.id,
      };
      this.focusedPaneId = leaf.id;
      this.syncPaneStatesFromLayout();
      this.persistSplitLayout();
      return;
    }

    const targetId = this.focusedPaneId ?? allLeafIds(this.splitLayout.root)[0];
    if (!targetId) {
      return;
    }

    const newRoot = splitLeafWithTerminal(this.splitLayout.root, targetId, direction, terminalId);
    const newLeaves = allLeaves(newRoot);
    const oldIds = new Set(allLeafIds(this.splitLayout.root));
    const newLeaf = newLeaves.find((l) => !oldIds.has(l.id));
    const newPaneId = newLeaf?.id ?? targetId;

    this.splitLayout = {
      root: newRoot,
      focusedPaneId: newPaneId,
    };
    this.focusedPaneId = newPaneId;
    this.syncPaneStatesFromLayout();
    this.persistSplitLayout();
  }

  /** Close a terminal pane and dispose its resources. */
  async closeTerminalPane(paneId: string) {
    const { disposeTerminalPane } = await import("./views/terminal-pane.js");
    disposeTerminalPane(paneId);
    await this.closePane(paneId);
  }

  /** Replace the terminal session in a pane (used for restart). */
  replaceTerminalInPane(paneId: string, newTerminalId: string) {
    if (!this.splitLayout) {
      return;
    }
    const leaf = findLeaf(this.splitLayout.root, paneId);
    if (!leaf || leaf.paneType !== "terminal") {
      return;
    }
    const newRoot = setLeafThread(this.splitLayout.root, paneId, newTerminalId);
    this.splitLayout = { ...this.splitLayout, root: newRoot };
    this.syncPaneStatesFromLayout();
    this.persistSplitLayout();
  }

  /** Create a terminal session via HTTP POST. Returns the terminal ID or null on failure. */
  private async _createTerminalSession(): Promise<string | null> {
    try {
      const base = this.basePath || window.location.origin;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (this.password) {
        headers["Authorization"] = `Bearer ${this.password}`;
      }
      const resp = await fetch(`${base}/api/terminals`, { method: "POST", headers });
      if (!resp.ok) {
        console.error("Failed to create terminal session:", resp.status);
        return null;
      }
      const data = (await resp.json()) as { id: string };
      return data.id;
    } catch (err) {
      console.error("Failed to create terminal session:", err);
      return null;
    }
  }

  /**
   * Load chat history for all visible panes' session keys.
   * Non-focused panes store messages in their ThreadState.
   * Creates ThreadState entries for any unmapped session keys.
   */
  async loadAllPaneHistories() {
    if (!this.splitLayout || !this.client || !this.connected) {
      return;
    }
    const leaves = allLeaves(this.splitLayout.root);
    const focusedKey = this.sessionKey;

    for (const leaf of leaves) {
      if (leaf.threadId === focusedKey) {
        continue;
      } // Already loaded by main flow

      // Ensure a ThreadState exists for this session key
      let threadMapId = this.sessionKeyToThreadId.get(leaf.threadId);
      let thread = threadMapId ? this.threads.get(threadMapId) : null;
      if (!thread) {
        const desc: import("./thread-state").ThreadDescriptor = {
          id: `pane-${leaf.id}`,
          sessionKey: leaf.threadId,
          label: "",
          createdAt: Date.now(),
          lastActivityAt: Date.now(),
          parentSessionKey: leaf.threadId.split(":thread:")[0] || leaf.threadId,
        };
        thread = createThreadState(desc);
        this.threads.set(desc.id, thread);
        this.sessionKeyToThreadId.set(desc.sessionKey, desc.id);
        threadMapId = desc.id;
      }

      // Load history if the thread has no messages yet
      if (thread.chatMessages.length === 0) {
        try {
          const res = await this.client.request("chat.history", {
            sessionKey: leaf.threadId,
            limit: 200,
          });
          thread.chatMessages = Array.isArray(res.messages) ? res.messages : [];
          thread.chatThinkingLevel = res.thinkingLevel ?? null;
        } catch {
          // Non-critical — pane will show empty until next refresh
        }
      }
      thread.chatLoading = false;
    }
    // Trigger re-render for all panes
    this.threads = new Map(this.threads);

    // Scroll all panes to bottom after loading history
    await this.updateComplete;
    this.scrollAllPanesToBottom();
  }

  /** Force-scroll every split pane's .chat-thread to the bottom. */
  scrollAllPanesToBottom() {
    const scrollAll = () => {
      if (!this.splitLayout) {
        // Single-pane mode: scroll the main chat thread
        const thread = this.querySelector(".chat-thread");
        if (thread) {
          thread.scrollTop = thread.scrollHeight;
        }
        return;
      }
      const leaves = allLeaves(this.splitLayout.root);
      for (const leaf of leaves) {
        const paneEl = this.querySelector(`[data-pane-id="${leaf.id}"] .chat-thread`);
        if (paneEl) {
          paneEl.scrollTop = paneEl.scrollHeight;
        }
      }
    };
    // Immediate scroll + retry after render settles (images, lazy content)
    requestAnimationFrame(() => {
      scrollAll();
      setTimeout(scrollAll, 150);
    });
  }

  // Model selection handlers
  async handleModelsLoad() {
    if (!this.client || !this.connected) {
      return;
    }
    if (this.modelsLoading) {
      return;
    }
    this.modelsLoading = true;
    try {
      const res = await this.client.request("models.list", {});
      const payload = res as { models?: unknown[] } | undefined;
      this.modelsList = (
        Array.isArray(payload?.models) ? payload.models : []
      ) as ModelCatalogEntry[];
      this.modelsError = null;
    } catch (err) {
      this.modelsError = String(err);
    } finally {
      this.modelsLoading = false;
    }
  }

  async handleModelSelect(modelRef: string) {
    this.applySettings({ ...this.settings, selectedModel: modelRef });
    if (!this.client || !this.connected || !this.sessionKey) return;
    try {
      await this.client.request("sessions.patch", {
        key: this.sessionKey,
        model: modelRef || null,
      });
    } catch {
      /* non-critical */
    }
  }

  async handleModelsConfigLoad() {
    if (!this.client) return;
    this.modelsConfigLoading = true;
    this.modelsConfigError = null;
    try {
      // Load both the model catalog (effective providers) and raw config
      const [catalogResult, configResult] = await Promise.all([
        this.client.request<{
          models?: Array<{
            provider: string;
            id: string;
            name: string;
            contextWindow?: number;
            maxTokens?: number;
            reasoning?: boolean;
            input?: string[];
            cost?: { input: number; output: number; cacheRead?: number; cacheWrite?: number };
          }>;
        }>("models.list", {}),
        this.client.request<{
          hash: string;
          config?: {
            models?: {
              providers?: Record<string, import("./views/models").ModelProvider>;
              visibleModels?: string[];
            };
          };
        }>("config.get", {}),
      ]);

      // Store the config hash for optimistic concurrency
      this.modelsConfigHash = configResult?.hash ?? null;

      // Load visible models setting
      this.visibleModels = configResult?.config?.models?.visibleModels ?? [];

      const catalogModels = catalogResult?.models ?? [];
      const configProviders = configResult?.config?.models?.providers ?? {};

      // Build provider list from config (editable) + catalog (for display)
      const providerMap = new Map<string, import("./views/models").ModelProvider>();

      // First add explicit providers from config
      for (const [name, provider] of Object.entries(configProviders)) {
        providerMap.set(name, { ...provider, name });
      }

      // Then add implicit providers from catalog (auth-based like Anthropic)
      // Group models by provider
      const modelsByProvider = new Map<string, typeof catalogModels>();
      for (const model of catalogModels) {
        if (!modelsByProvider.has(model.provider)) {
          modelsByProvider.set(model.provider, []);
        }
        modelsByProvider.get(model.provider)!.push(model);
      }

      // Add providers that aren't in config yet (as read-only style)
      for (const [providerName, models] of modelsByProvider) {
        if (!providerMap.has(providerName)) {
          // This is an implicit provider (like Anthropic from auth profiles)
          // Sort models by capability: reasoning > vision > context window
          const sortedModels = [...models].sort((a, b) => {
            const score = (m: typeof a) => {
              let s = 0;
              if (m.reasoning) s += 1000;
              if (m.input?.includes("image")) s += 100;
              s += (m.contextWindow ?? 0) / 10000;
              return s;
            };
            return score(b) - score(a);
          });
          providerMap.set(providerName, {
            name: providerName,
            baseUrl: "",
            apiKey: "",
            models: sortedModels.map((m) => ({
              id: m.id,
              name: m.name,
              api: "anthropic-messages" as const,
              reasoning: m.reasoning ?? false,
              input: (m.input as Array<"text" | "image">) ?? ["text"],
              contextWindow: m.contextWindow ?? 200000,
              maxTokens: m.maxTokens ?? 8192,
              cost: m.cost ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            })),
            isImplicit: true,
          });
        } else {
          // Sort existing provider's models too
          const provider = providerMap.get(providerName)!;
          provider.models = [...provider.models].sort((a, b) => {
            const score = (m: typeof a) => {
              let s = 0;
              if (m.reasoning) s += 1000;
              if (m.input?.includes("image")) s += 100;
              s += (m.contextWindow ?? 0) / 10000;
              return s;
            };
            return score(b) - score(a);
          });
        }
      }

      this.modelsConfig = { providers: Array.from(providerMap.values()) };
    } catch (error) {
      this.modelsConfigError = error instanceof Error ? error.message : String(error);
    } finally {
      this.modelsConfigLoading = false;
    }
  }

  async handleModelsConfigSave() {
    if (!this.client || !this.modelsConfig) return;
    this.modelsConfigSaving = true;
    this.modelsConfigError = null;
    try {
      // Get the current config hash
      const baseHash = this.modelsConfigHash;
      if (!baseHash) {
        this.modelsConfigError = "Config hash missing; reload and retry.";
        return;
      }

      // Convert Array<Provider> to Record<string, Provider>, filtering out implicit providers
      const providersRecord: Record<
        string,
        Omit<import("./views/models").ModelProvider, "name" | "isImplicit">
      > = {};
      for (const provider of this.modelsConfig.providers) {
        if (provider.isImplicit) continue; // Skip auth-based providers like Anthropic
        const { name, isImplicit, ...providerConfig } = provider;
        providersRecord[name] = providerConfig;
      }

      // Use config.set with baseHash for optimistic concurrency
      await this.client.request("config.set", {
        raw: JSON.stringify({
          models: { providers: providersRecord, visibleModels: this.visibleModels },
        }),
        baseHash,
      });

      // Reload to refresh implicit providers
      await this.handleModelsConfigLoad();
    } catch (error) {
      this.modelsConfigError = error instanceof Error ? error.message : String(error);
    } finally {
      this.modelsConfigSaving = false;
    }
  }

  handleToggleModelVisibility(modelRef: string, visible: boolean) {
    if (visible) {
      this.visibleModels = [...this.visibleModels, modelRef];
    } else {
      this.visibleModels = this.visibleModels.filter((m) => m !== modelRef);
    }
  }

  render() {
    return renderApp(this);
  }
}
