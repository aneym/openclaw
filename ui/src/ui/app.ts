import { LitElement, html, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import type { EventLogEntry } from "./app-events";
import type { DevicePairingList } from "./controllers/devices";
import type { ExecApprovalRequest } from "./controllers/exec-approval";
import type { ExecApprovalsFile, ExecApprovalsSnapshot } from "./controllers/exec-approvals";
import type { GatewayBrowserClient, GatewayHelloOk } from "./gateway";
import type { Tab } from "./navigation";
import type { ResolvedTheme, ThemeMode } from "./theme";
import type { ThreadState } from "./thread-state";
import {
  type ThreadDescriptor,
  createThreadDescriptor,
  createThreadState,
  snapshotThreadState,
  restoreThreadState,
} from "./thread-state";
import { loadThreadDescriptors, saveThreadDescriptors } from "./thread-storage";
import { loadChatHistory } from "./controllers/chat";
import { patchSession } from "./controllers/sessions";
import { resetToolStream as resetToolStreamFn } from "./app-tool-stream";
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
import type { SplitPaneLayout, SplitDirection } from "./split-tree";
import {
  createLeaf,
  splitLeaf as splitLeafTree,
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
import { type PaneState, type ArtifactTab, syncPaneStates } from "./pane-state";
import { fetchFileContent } from "./controllers/file";
import type { SkillMessage } from "./controllers/skills";
import type { ToolApprovalRequest } from "./controllers/tool-approval";
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
  handleAbortChat as handleAbortChatInternal,
  handleSendChat as handleSendChatInternal,
  removeQueuedMessage as removeQueuedMessageInternal,
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
import {
  resetToolStream as resetToolStreamInternal,
  type ToolStreamEntry,
} from "./app-tool-stream";
import { resolveInjectedAssistantIdentity } from "./assistant-identity";
import { loadAssistantIdentity as loadAssistantIdentityInternal } from "./controllers/assistant-identity";
import { loadSettings, type UiSettings } from "./storage";
import { type ChatAttachment, type ChatQueueItem, type CronFormState } from "./ui-types";
import { loadDraft, clearDraft, loadAttachments, clearAttachments, loadQueue } from "./draft-storage";

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
  /** Session keys that currently have an active agent run (global, across all sessions). */
  @state() runningSessions: Set<string> = new Set();
  // Sidebar state for tool output viewing
  @state() sidebarOpen = false;
  @state() sidebarContent: string | null = null;
  @state() sidebarError: string | null = null;
  @state() splitRatio = this.settings.splitRatio;

  // Global artifact panel state (renders to the right of all panes)
  @state() artifactOpen = false;
  @state() artifactTabs: import('./pane-state').ArtifactTab[] = [];
  @state() artifactActiveTabId: string | null = null;
  @state() artifactSplitRatio = 0.65;
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

  client: GatewayBrowserClient | null = null;
  private chatScrollFrame: number | null = null;
  private chatScrollTimeout: number | null = null;
  private chatHasAutoScrolled = false;
  private chatUserNearBottom = true;
  private nodesPollInterval: number | null = null;
  private logsPollInterval: number | null = null;
  private debugPollInterval: number | null = null;
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

  connectedCallback() {
    super.connectedCallback();
    handleConnected(this as unknown as Parameters<typeof handleConnected>[0]);
    this.addEventListener("chat-load-more", () => this.requestUpdate());
    // Restore draft + attachments + queue for the active session (survives HMR)
    const draft = loadDraft(this.sessionKey);
    if (draft && !this.chatMessage) this.chatMessage = draft;
    const attachments = loadAttachments(this.sessionKey);
    if (attachments.length && !this.chatAttachments.length) this.chatAttachments = attachments;
    const queue = loadQueue(this.sessionKey);
    if (queue.length && !this.chatQueue.length) this.chatQueue = queue;
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

  async abortThreadRun(sessionKey: string, runId: string): Promise<boolean> {
    if (!this.client || !this.connected) return false;
    try {
      await this.client.request("chat.abort", { sessionKey, runId });
      return true;
    } catch (err) {
      this.lastError = String(err);
      return false;
    }
  }

  removeQueuedMessage(id: string) {
    removeQueuedMessageInternal(
      this as unknown as Parameters<typeof removeQueuedMessageInternal>[0],
      id,
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
    if (!active || !this.client || this.toolApprovalBusy) return;
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
  }

  handleCloseSidebar() {
    this.sidebarOpen = false;
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
    if (!manual && this.artifactClosedPaths.has(filePath)) return;

    const existing = this.artifactTabs.find((t) => t.filePath === filePath);
    if (existing) {
      this.artifactActiveTabId = existing.id;
      this.artifactOpen = true;
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
    this.refreshArtifactTab(tabId);
  }

  handleArtifactTabSelect(tabId: string) {
    this.artifactActiveTabId = tabId;
  }

  handleArtifactTabClose(tabId: string) {
    const tab = this.artifactTabs.find((t) => t.id === tabId);
    if (tab?.filePath) this.artifactClosedPaths.add(tab.filePath);
    this.artifactTabs = this.artifactTabs.filter((t) => t.id !== tabId);
    if (this.artifactActiveTabId === tabId) {
      this.artifactActiveTabId = this.artifactTabs[this.artifactTabs.length - 1]?.id ?? null;
    }
    if (this.artifactTabs.length === 0) {
      this.artifactOpen = false;
    }
  }

  handleArtifactRefresh(tabId: string) {
    this.refreshArtifactTab(tabId);
  }

  handleArtifactClose() {
    this.artifactOpen = false;
  }

  handleArtifactToggleRaw(tabId: string) {
    const tab = this.artifactTabs.find((t) => t.id === tabId);
    if (!tab) return;
    const isMd = tab.fileName.endsWith('.md') || tab.fileName.endsWith('.mdx');
    if (isMd) {
      // For markdown: toggle between rendered → editing → rendered
      if (tab.editing) {
        // Cancel editing
        tab.editing = false;
        tab.editDraft = undefined;
      } else {
        // Enter edit mode
        tab.editing = true;
        tab.editDraft = tab.content ?? '';
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
    if (!tab) return;
    (tab as ArtifactTab & { editDraft?: string }).editDraft = content;

    // Clear existing timer
    const existing = this.artifactAutoSaveTimers.get(tabId);
    if (existing) clearTimeout(existing);

    // Debounce 1.5s then save
    this.artifactAutoSaveTimers.set(tabId, setTimeout(() => {
      this.artifactAutoSaveTimers.delete(tabId);
      this.handleArtifactSave(tabId, content);
    }, 1500));
  }

  handleArtifactSave(tabId: string, content: string) {
    const tab = this.artifactTabs.find((t) => t.id === tabId);
    if (!tab) return;
    // Skip save if content hasn't changed
    if (content === tab.content) return;

    tab.saving = true;
    this.artifactTabs = [...this.artifactTabs];

    import('./controllers/file').then(({ writeFileContent }) =>
      writeFileContent(this.basePath, tab.filePath, content, this.password)
        .then((result) => {
          const t = this.artifactTabs.find((t) => t.id === tabId);
          if (!t) return;
          t.content = content;
          t.mtime = result.mtime;
          t.saving = false;
          this.artifactTabs = [...this.artifactTabs];
        })
        .catch((err: Error) => {
          const t = this.artifactTabs.find((t) => t.id === tabId);
          if (!t) return;
          t.saving = false;
          t.error = err.message;
          this.artifactTabs = [...this.artifactTabs];
        })
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
    if (existing) clearTimeout(existing);

    this.artifactRefreshTimers.set(
      tabId,
      setTimeout(() => {
        this.artifactRefreshTimers.delete(tabId);
        this.doRefreshArtifactTab(tabId);
      }, 300),
    );
  }

  private async doRefreshArtifactTab(tabId: string) {
    const tab = this.artifactTabs.find((t) => t.id === tabId);
    if (!tab || tab.isLegacy) return;

    // Set loading
    tab.loading = true;
    tab.error = null;
    this.artifactTabs = [...this.artifactTabs];

    try {
      const result = await fetchFileContent(this.basePath, tab.filePath, this.password);
      const t = this.artifactTabs.find((t) => t.id === tabId);
      if (!t) return; // tab was closed during fetch
      t.content = result.content;
      t.mtime = result.mtime;
      t.loading = false;
      t.error = null;
      t.updated = true;
      // Auto-enter edit mode for markdown files
      const isMd = t.fileName.endsWith('.md') || t.fileName.endsWith('.mdx');
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
      if (!t) return;
      t.loading = false;
      t.error = err instanceof Error ? err.message : String(err);
      this.artifactTabs = [...this.artifactTabs];
    }
  }

  switchThread(threadId: string) {
    if (threadId === this.activeThreadId) return;
    const nextThread = this.threads.get(threadId);
    if (!nextThread) return;

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
    resetToolStreamFn(
      this as unknown as Parameters<typeof resetToolStreamFn>[0],
    );
    this.resetChatScroll();
    void loadChatHistory(this as unknown as Parameters<typeof loadChatHistory>[0]);

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
    const mainThread = this.activeThreadId
      ? this.threads.get(this.activeThreadId)
      : null;
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
    if (!this.threads.has(threadId)) return;
    if (this.threads.size <= 1) return; // keep at least one

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
    if (!thread) return;
    thread.descriptor.label = label;
    saveThreadDescriptors(this.getThreadDescriptors());
    this.threads = new Map(this.threads);
  }

  getThreadDescriptors(): ThreadDescriptor[] {
    return Array.from(this.threads.values())
      .map((t) => t.descriptor)
      .sort((a, b) => b.lastActivityAt - a.lastActivityAt);
  }

  initThreadsFromStorage() {
    const saved = loadThreadDescriptors();
    if (saved.length > 0) {
      for (const desc of saved) {
        const thread = createThreadState(desc);
        // Restore draft text + attachments + queue that survived HMR / page reload
        const draft = loadDraft(desc.sessionKey);
        if (draft) thread.chatMessage = draft;
        const attachments = loadAttachments(desc.sessionKey);
        if (attachments.length) thread.chatAttachments = attachments;
        const savedQueue = loadQueue(desc.sessionKey);
        if (savedQueue.length) thread.chatQueue = savedQueue;
        this.threads.set(desc.id, thread);
        this.sessionKeyToThreadId.set(desc.sessionKey, desc.id);
      }
      const lastId = this.settings.lastActiveThreadId;
      this.activeThreadId =
        lastId && this.threads.has(lastId) ? lastId : saved[0].id;
      // Sync host sessionKey to match the active thread so that
      // loadChatHistory fetches the correct session after reconnect/HMR.
      // Only override if the URL didn't explicitly set a session key
      // (applySettingsFromUrl runs before this, so check for ?session= param).
      const urlHasExplicitSession = new URLSearchParams(window.location.search).has('session');
      if (!urlHasExplicitSession) {
        const activeThread = this.threads.get(this.activeThreadId);
        if (activeThread) {
          this.sessionKey = activeThread.descriptor.sessionKey;
        }
      }
    }
  }

  initDefaultThread() {
    if (this.threads.size > 0) return;
    const descriptor: ThreadDescriptor = {
      id: 'main-thread',
      sessionKey: this.sessionKey,
      label: 'Main',
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

  splitPane(direction: 'horizontal' | 'vertical') {
    const currentSessionKey = this.sessionKey;

    // Ensure the current session has a ThreadState so focus-switching can
    // snapshot/restore its data. Without this, the snapshot silently fails
    // and the pane's content is lost when focus moves away.
    if (!this.sessionKeyToThreadId.has(currentSessionKey)) {
      const mainDesc: ThreadDescriptor = {
        id: `main-thread`,
        sessionKey: currentSessionKey,
        label: 'Main',
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
        parentSessionKey: currentSessionKey,
      };
      const mainThread = createThreadState(mainDesc);
      // Snapshot current live state into the new ThreadState immediately
      Object.assign(mainThread, snapshotThreadState(this));
      this.threads.set(mainDesc.id, mainThread);
      this.sessionKeyToThreadId.set(mainDesc.sessionKey, mainDesc.id);
      if (!this.activeThreadId) this.activeThreadId = mainDesc.id;
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
      const firstLeaf = createLeaf(currentSessionKey, 'pane-initial');
      const secondLeaf = createLeaf(newDescriptor.sessionKey);
      newPaneId = secondLeaf.id;
      this.splitLayout = {
        root: {
          kind: 'branch',
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
      if (!targetId) return;
      const newRoot = splitLeafTree(this.splitLayout.root, targetId, direction, newDescriptor.sessionKey);
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
    // Focus the new pane — this snapshots current thread & restores the new one.
    // focusPane already schedules a managed textarea.focus() timer, so no
    // duplicate setTimeout here (that was the second source of stale timers).
    this.focusPane(newPaneId);
    this.resetChatScroll();
  }

  closePane(paneId?: string) {
    if (!this.splitLayout) return;
    const targetId = paneId ?? this.focusedPaneId ?? allLeafIds(this.splitLayout.root)[0];
    if (!targetId) return;

    // Clean up empty auto-created thread for the closing pane
    const closedLeaf = findLeaf(this.splitLayout.root, targetId);
    if (closedLeaf) {
      const closedMapId = this.sessionKeyToThreadId.get(closedLeaf.threadId);
      if (closedMapId && closedMapId !== 'main-thread') {
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
    if (!newRoot || newRoot.kind === 'leaf') {
      // Only one pane left or tree is empty - exit split mode
      if (newRoot?.kind === 'leaf') {
        this.sessionKey = newRoot.threadId;
        // Restore the remaining thread's state
        const remainingId = this.sessionKeyToThreadId.get(newRoot.threadId);
        if (remainingId) {
          const remainingThread = this.threads.get(remainingId);
          if (remainingThread) {
            restoreThreadState(this, remainingThread);
          }
        }
      }
      this.splitLayout = null;
      this.focusedPaneId = null;
      this.paneStates = new Map();
      this.persistSplitLayout();
      this.syncUrlWithPanes(false);
      return;
    }

    // Move focus to an adjacent pane
    const remainingIds = allLeafIds(newRoot);
    const newFocus = remainingIds.includes(this.focusedPaneId ?? '')
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
          label: '',
          createdAt: Date.now(),
          lastActivityAt: Date.now(),
          parentSessionKey: this.sessionKey.split(':thread:')[0] || this.sessionKey,
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
  }

  focusPane(paneId: string) {
    // Guard: no-op if this pane is already focused — avoids redundant
    // re-renders and the uncancelled-setTimeout cascade that causes
    // infinite focus ping-pong between panes.
    if (paneId === this.focusedPaneId) return;

    const switching = this.focusedPaneId !== null;

    this.focusedPaneId = paneId;
    if (this.splitLayout) {
      this.splitLayout = { ...this.splitLayout, focusedPaneId: paneId };
    }

    const leaf = this.splitLayout ? findLeaf(this.splitLayout.root, paneId) : null;
    if (!leaf) return;

    // Snapshot current thread's live state before switching
    if (switching) {
      let prevThreadId = this.sessionKeyToThreadId.get(this.sessionKey);
      // Ensure a ThreadState exists for the current session so snapshot has a target
      if (!prevThreadId) {
        const desc: ThreadDescriptor = {
          id: `pane-snap-${Date.now()}`,
          sessionKey: this.sessionKey,
          label: '',
          createdAt: Date.now(),
          lastActivityAt: Date.now(),
          parentSessionKey: this.sessionKey.split(':thread:')[0] || this.sessionKey,
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
      if (this.focusedPaneId !== paneId) return;
      const paneEl = document.querySelector(`.split-pane[data-pane-id="${paneId}"]`);
      const textarea = paneEl?.querySelector<HTMLTextAreaElement>('.chat-compose textarea');
      if (textarea && !textarea.disabled) textarea.focus();
    }, 50);
  }

  setThreadInPane(paneId: string, threadId: string) {
    if (!this.splitLayout) return;

    // Prevent duplicate: if thread is already in another pane, focus it instead
    const existingLeaf = allLeaves(this.splitLayout.root).find(
      (l) => l.threadId === threadId && l.id !== paneId
    );
    if (existingLeaf) {
      this.focusPane(existingLeaf.id);
      return;
    }

    // Clean up the old thread if it was an empty auto-created one
    const oldLeaf = findLeaf(this.splitLayout.root, paneId);
    if (oldLeaf && oldLeaf.threadId !== threadId) {
      const oldMapId = this.sessionKeyToThreadId.get(oldLeaf.threadId);
      if (oldMapId && oldMapId !== 'main-thread') {
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
        label: '',
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
        parentSessionKey: threadId.split(':thread:')[0] || threadId,
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
          const res = (await this.client!.request('chat.history', {
            sessionKey: threadId,
            limit: 200,
          })) as { messages?: unknown[]; thinkingLevel?: string | null };
          thread.chatMessages = Array.isArray(res.messages) ? res.messages : [];
          thread.chatThinkingLevel = res.thinkingLevel ?? null;
          this.threads = new Map(this.threads);
        } catch { /* non-critical */ }
      })();
    }
  }

  swapPanes(paneIdA: string, paneIdB: string) {
    if (!this.splitLayout || paneIdA === paneIdB) return;
    const newRoot = swapLeafThreads(this.splitLayout.root, paneIdA, paneIdB);
    this.splitLayout = { ...this.splitLayout, root: newRoot };
    this.syncPaneStatesFromLayout();
    this.persistSplitLayout();
    this.syncUrlWithPanes(false);
  }

  movePaneBeside(sourcePaneId: string, targetPaneId: string, direction: SplitDirection, position: 'before' | 'after') {
    if (!this.splitLayout || sourcePaneId === targetPaneId) return;
    const newRoot = moveLeafBeside(this.splitLayout.root, sourcePaneId, targetPaneId, direction, position);
    if (!newRoot) return;
    this.splitLayout = { ...this.splitLayout, root: newRoot };
    this.syncPaneStatesFromLayout();
    this.persistSplitLayout();
    this.syncUrlWithPanes(false);
  }

  handleSplitBranchResize(branchId: string, ratio: number) {
    if (!this.splitLayout) return;
    const newRoot = updateBranchRatio(this.splitLayout.root, branchId, ratio);
    this.splitLayout = { ...this.splitLayout, root: newRoot };
    this.persistSplitLayout();
  }

  focusNextPane() {
    if (!this.splitLayout || !this.focusedPaneId) return;
    const next = nextLeafId(this.splitLayout.root, this.focusedPaneId);
    if (next) this.focusPane(next);
  }

  toggleNav() {
    this.applySettings({
      ...this.settings,
      navCollapsed: !this.settings.navCollapsed,
    });
  }

  archiveCurrentSession() {
    const key = this.sessionKey;
    if (!key) return;
    void patchSession(this as any, key, { archived: true });
    // Close the pane in split mode
    if (this.splitLayout) {
      const leaf = allLeaves(this.splitLayout.root).find(
        (l) => l.threadId === key,
      );
      if (leaf) this.closePane(leaf.id);
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

  exitSplitMode() {
    this.splitLayout = null;
    this.focusedPaneId = null;
    this.paneStates = new Map();
    this.persistSplitLayout();
    this.syncUrlWithPanes(false);
  }

  restoreSplitLayout() {
    const raw = this.settings.splitLayout;
    if (!raw) return;
    const layout = deserializeLayout(raw);
    if (!layout) return;
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

  /**
   * Load chat history for all visible panes' session keys.
   * Non-focused panes store messages in their ThreadState.
   * Creates ThreadState entries for any unmapped session keys.
   */
  async loadAllPaneHistories() {
    if (!this.splitLayout || !this.client || !this.connected) return
    const leaves = allLeaves(this.splitLayout.root)
    const focusedKey = this.sessionKey

    for (const leaf of leaves) {
      if (leaf.threadId === focusedKey) continue // Already loaded by main flow

      // Ensure a ThreadState exists for this session key
      let threadMapId = this.sessionKeyToThreadId.get(leaf.threadId)
      let thread = threadMapId ? this.threads.get(threadMapId) : null
      if (!thread) {
        const desc: import('./thread-state').ThreadDescriptor = {
          id: `pane-${leaf.id}`,
          sessionKey: leaf.threadId,
          label: '',
          createdAt: Date.now(),
          lastActivityAt: Date.now(),
          parentSessionKey: leaf.threadId.split(':thread:')[0] || leaf.threadId,
        }
        thread = createThreadState(desc)
        this.threads.set(desc.id, thread)
        this.sessionKeyToThreadId.set(desc.sessionKey, desc.id)
        threadMapId = desc.id
      }

      // Load history if the thread has no messages yet
      if (thread.chatMessages.length === 0) {
        try {
          const res = (await this.client.request('chat.history', {
            sessionKey: leaf.threadId,
            limit: 200,
          })) as { messages?: unknown[]; thinkingLevel?: string | null }
          thread.chatMessages = Array.isArray(res.messages) ? res.messages : []
          thread.chatThinkingLevel = res.thinkingLevel ?? null
        } catch {
          // Non-critical — pane will show empty until next refresh
        }
      }
      thread.chatLoading = false;
    }
    // Trigger re-render for all panes
    this.threads = new Map(this.threads)

    // Scroll all panes to bottom after loading history
    await this.updateComplete
    this.scrollAllPanesToBottom()
  }

  /** Force-scroll every split pane's .chat-thread to the bottom. */
  scrollAllPanesToBottom() {
    const scrollAll = () => {
      if (!this.splitLayout) {
        // Single-pane mode: scroll the main chat thread
        const thread = this.querySelector('.chat-thread') as HTMLElement | null
        if (thread) {
          thread.scrollTop = thread.scrollHeight
        }
        return
      }
      const leaves = allLeaves(this.splitLayout.root)
      for (const leaf of leaves) {
        const paneEl = this.querySelector(`[data-pane-id="${leaf.id}"] .chat-thread`) as HTMLElement | null
        if (paneEl) {
          paneEl.scrollTop = paneEl.scrollHeight
        }
      }
    }
    // Immediate scroll + retry after render settles (images, lazy content)
    requestAnimationFrame(() => {
      scrollAll()
      setTimeout(scrollAll, 150)
    })
  }

  render() {
    return renderApp(this);
  }
}
