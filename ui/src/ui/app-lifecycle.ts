import type { Tab } from "./navigation";
import type { UiSettings } from "./storage";
import { connectGateway } from "./app-gateway";
import {
  applySettingsFromUrl,
  attachThemeListener,
  detachThemeListener,
  inferBasePath,
  restoreSplitLayoutFromUrl,
  syncTabWithLocation,
  syncThemeWithSettings,
} from "./app-settings";
import { observeTopbar, scheduleChatScroll, schedulePaneChatScroll, scheduleLogsScroll } from "./app-scroll";
import {
  startLogsPolling,
  startNodesPolling,
  stopLogsPolling,
  stopNodesPolling,
  startDebugPolling,
  stopDebugPolling,
} from "./app-polling";
import { installKeyboardShortcuts, removeKeyboardShortcuts } from "./keyboard-shortcuts";
import type { SplitPaneLayout } from "./split-tree";
import { refreshChat } from "./app-chat";

type LifecycleHost = {
  basePath: string;
  tab: Tab;
  settings: UiSettings;
  chatHasAutoScrolled: boolean;
  chatLoading: boolean;
  chatMessages: unknown[];
  chatToolMessages: unknown[];
  chatStream: string;
  logsAutoFollow: boolean;
  logsAtBottom: boolean;
  logsEntries: unknown[];
  popStateHandler: () => void;
  topbarObserver: ResizeObserver | null;
  initThreadsFromStorage: () => void;
  restoreSplitLayout: () => void;
  // Split pane management (for keyboard shortcuts)
  splitLayout: SplitPaneLayout | null;
  focusedPaneId: string | null;
  splitPane: (direction: 'horizontal' | 'vertical') => void;
  closePane: (paneId?: string) => void;
  focusNextPane: () => void;
  toggleNav: () => void;
  syncPaneStatesFromLayout: () => void;
  // URL pane restoration (set by applySettingsFromUrl)
  urlPanes?: { paneKeys: string[]; focusIndex: number } | null;
  // Visibility change handler for staleness detection
  connected: boolean;
  visibilityHandler: (() => void) | null;
};

export function handleConnected(host: LifecycleHost) {
  host.basePath = inferBasePath();
  applySettingsFromUrl(
    host as unknown as Parameters<typeof applySettingsFromUrl>[0],
  );
  syncTabWithLocation(
    host as unknown as Parameters<typeof syncTabWithLocation>[0],
    true,
  );
  syncThemeWithSettings(
    host as unknown as Parameters<typeof syncThemeWithSettings>[0],
  );
  attachThemeListener(
    host as unknown as Parameters<typeof attachThemeListener>[0],
  );
  window.addEventListener("popstate", host.popStateHandler);
  // Always load saved thread descriptors (threads are always enabled)
  host.initThreadsFromStorage();
  connectGateway(host as unknown as Parameters<typeof connectGateway>[0]);
  // Install split-pane keyboard shortcuts
  installKeyboardShortcuts(host);
  // Restore split layout: prefer URL panes over localStorage
  const urlPanes = host.urlPanes;
  if (urlPanes && urlPanes.paneKeys.length > 1) {
    const layout = restoreSplitLayoutFromUrl(
      urlPanes.paneKeys,
      urlPanes.focusIndex,
      host.settings.splitLayout,
    );
    if (layout) {
      host.splitLayout = layout;
      host.focusedPaneId = layout.focusedPaneId;
      host.syncPaneStatesFromLayout();
    }
  } else {
    // Fall back to localStorage split layout
    host.restoreSplitLayout();
  }
  startNodesPolling(host as unknown as Parameters<typeof startNodesPolling>[0]);
  if (host.tab === "logs") {
    startLogsPolling(host as unknown as Parameters<typeof startLogsPolling>[0]);
  }
  if (host.tab === "debug") {
    startDebugPolling(host as unknown as Parameters<typeof startDebugPolling>[0]);
  }
  // Refresh chat when user returns to the tab (catches agent finishing while away)
  host.visibilityHandler = () => {
    if (document.visibilityState === 'visible' && host.connected) {
      void refreshChat(host as unknown as Parameters<typeof refreshChat>[0]);
    }
  };
  document.addEventListener('visibilitychange', host.visibilityHandler);
}

export function handleFirstUpdated(host: LifecycleHost) {
  observeTopbar(host as unknown as Parameters<typeof observeTopbar>[0]);
  // Auto-focus handled in handleUpdated when connected transitions to true
}

export function handleDisconnected(host: LifecycleHost) {
  window.removeEventListener("popstate", host.popStateHandler);
  if (host.visibilityHandler) {
    document.removeEventListener('visibilitychange', host.visibilityHandler);
    host.visibilityHandler = null;
  }
  removeKeyboardShortcuts();
  stopNodesPolling(host as unknown as Parameters<typeof stopNodesPolling>[0]);
  stopLogsPolling(host as unknown as Parameters<typeof stopLogsPolling>[0]);
  stopDebugPolling(host as unknown as Parameters<typeof stopDebugPolling>[0]);
  detachThemeListener(
    host as unknown as Parameters<typeof detachThemeListener>[0],
  );
  host.topbarObserver?.disconnect();
  host.topbarObserver = null;
}

export function handleUpdated(
  host: LifecycleHost,
  changed: Map<PropertyKey, unknown>,
) {
  // Auto-focus the chat composer when the gateway first connects
  if (
    host.tab === "chat" &&
    changed.has("connected") &&
    host.connected &&
    !changed.get("connected")
  ) {
    setTimeout(() => {
      const el = document.querySelector<HTMLTextAreaElement>('.chat-compose textarea');
      if (el && !el.disabled) el.focus();
    }, 50);
  }
  if (
    host.tab === "chat" &&
    (changed.has("chatMessages") ||
      changed.has("chatToolMessages") ||
      changed.has("chatStream") ||
      changed.has("chatLoading") ||
      changed.has("tab"))
  ) {
    const forcedByTab = changed.has("tab");
    const forcedByLoad =
      changed.has("chatLoading") &&
      changed.get("chatLoading") === true &&
      host.chatLoading === false;
    const force = forcedByTab || forcedByLoad || !host.chatHasAutoScrolled;
    // In split-pane mode, scope scroll to the focused pane
    if (host.splitLayout && host.focusedPaneId) {
      schedulePaneChatScroll(
        host as unknown as Parameters<typeof schedulePaneChatScroll>[0],
        host.focusedPaneId,
        force,
      );
    } else {
      scheduleChatScroll(
        host as unknown as Parameters<typeof scheduleChatScroll>[0],
        force,
      );
    }
  }
  if (
    host.tab === "logs" &&
    (changed.has("logsEntries") || changed.has("logsAutoFollow") || changed.has("tab"))
  ) {
    if (host.logsAutoFollow && host.logsAtBottom) {
      scheduleLogsScroll(
        host as unknown as Parameters<typeof scheduleLogsScroll>[0],
        changed.has("tab") || changed.has("logsAutoFollow"),
      );
    }
  }
}
