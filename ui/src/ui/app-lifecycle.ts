import type { Tab } from "./navigation";
import type { SplitPaneLayout } from "./split-tree";
import type { UiSettings } from "./storage";
import type { ChatQueueItem } from "./ui-types";
import { refreshChat, flushChatQueueForEvent } from "./app-chat";
import { connectGateway } from "./app-gateway";
import {
  startLogsPolling,
  startModelsPolling,
  startNodesPolling,
  stopLogsPolling,
  stopModelsPolling,
  stopNodesPolling,
  startDebugPolling,
  stopDebugPolling,
} from "./app-polling";
import {
  observeTopbar,
  scheduleChatScroll,
  schedulePaneChatScroll,
  scheduleLogsScroll,
} from "./app-scroll";
import {
  applySettingsFromUrl,
  attachThemeListener,
  detachThemeListener,
  inferBasePath,
  restoreSplitLayoutFromUrl,
  syncTabWithLocation,
  syncThemeWithSettings,
} from "./app-settings";
import { loadModels } from "./controllers/models";
import { installKeyboardShortcuts, removeKeyboardShortcuts } from "./keyboard-shortcuts";
import { findLeaf } from "./split-tree";

type LifecycleHost = {
  basePath: string;
  tab: Tab;
  settings: UiSettings;
  chatHasAutoScrolled: boolean;
  chatLoading: boolean;
  chatRunId: string | null;
  chatSending: boolean;
  chatQueue: ChatQueueItem[];
  chatMessages: unknown[];
  chatToolMessages: unknown[];
  chatStream: string;
  logsAutoFollow: boolean;
  logsAtBottom: boolean;
  logsEntries: unknown[];
  popStateHandler: () => void;
  topbarObserver: ResizeObserver | null;
  initThreadsFromStorage?: () => void;
  restoreSplitLayout?: () => void;
  // Split pane management (for keyboard shortcuts)
  sessionKey: string;
  splitLayout: SplitPaneLayout | null;
  focusedPaneId: string | null;
  splitPane: (direction: "horizontal" | "vertical") => void;
  closePane: (paneId?: string) => void;
  focusNextPane: () => void;
  toggleNav: () => void;
  archiveCurrentSession: () => void;
  toggleGitPanel: () => void;
  syncPaneStatesFromLayout?: () => void;
  // URL pane restoration (set by applySettingsFromUrl)
  urlPanes?: { paneKeys: string[]; focusIndex: number } | null;
  // Visibility change handler for staleness detection
  connected: boolean;
  visibilityHandler: (() => void) | null;
  // Polling intervals
  nodesPollInterval: number | null;
  logsPollInterval: number | null;
  debugPollInterval: number | null;
  modelsPollInterval: number | null;
};

export async function handleConnected(host: LifecycleHost) {
  // Dev mode: update tab title + favicon background
  const isDev =
    import.meta.env.DEV || (window as unknown as Record<string, unknown>).__OPENCLAW_DEV__;
  if (import.meta.env.DEV) {
    document.title = "kbot (UI + GW Dev)";
  } else if (isDev) {
    document.title = "kbot (GW Dev)";
  }
  if (isDev) {
    // Tint favicon background so dev tabs are obvious
    const bg = import.meta.env.DEV ? "#b45309" : "#0f766e";
    const svg = [
      '<svg viewBox="-1 -1 27 26" xmlns="http://www.w3.org/2000/svg">',
      `<rect x="-1" y="-1" width="27" height="26" rx="5" fill="${bg}"/>`,
      '<path d="M1.2002 21.6035C1.86207 21.6035 2.40039 22.1399 2.40039 22.8018C2.40038 23.4636 1.86206 24 1.2002 24C0.538417 23.9999 1.07326e-05 23.4636 0 22.8018C0 22.1399 0.53841 21.6036 1.2002 21.6035ZM7.71484 19.8057C8.70755 19.8058 9.51562 20.6108 9.51562 21.6035C9.51551 22.5962 8.70748 23.4012 7.71484 23.4014C6.7221 23.4014 5.91418 22.5962 5.91406 21.6035C5.91406 20.6107 6.72203 19.8057 7.71484 19.8057ZM16.043 17.4092C17.0785 17.4092 17.918 18.2487 17.918 19.2842V20.3271C17.918 21.3627 17.0785 22.2021 16.043 22.2021H14.9912C13.9558 22.2021 13.1162 21.3626 13.1162 20.3271V19.2842C13.1162 18.2487 13.9558 17.4093 14.9912 17.4092H16.043ZM2.86035 14.7031C3.85316 14.7031 4.66113 15.5082 4.66113 16.501C4.6611 17.4938 3.85314 18.2988 2.86035 18.2988C1.86763 18.2987 1.0596 17.4937 1.05957 16.501C1.05957 15.5082 1.86762 14.7032 2.86035 14.7031ZM21.7812 11.8428C22.7261 11.8428 23.1986 11.8425 23.5596 12.0264C23.877 12.1881 24.1351 12.4463 24.2969 12.7637C24.4808 13.1246 24.4814 13.5979 24.4814 14.543V15.1396C24.4814 16.0846 24.4807 16.557 24.2969 16.918C24.1351 17.2354 23.877 17.4935 23.5596 17.6553C23.1986 17.8392 22.7261 17.8398 21.7812 17.8398H21.1836C20.2387 17.8398 19.7662 17.8392 19.4053 17.6553C19.0878 17.4935 18.8297 17.2354 18.668 16.918C18.4841 16.557 18.4844 16.0846 18.4844 15.1396V14.543C18.4844 13.5979 18.484 13.1246 18.668 12.7637C18.8298 12.4463 19.0878 12.1881 19.4053 12.0264C19.7662 11.8425 20.2387 11.8428 21.1836 11.8428H21.7812ZM10.6416 11.8428C11.6769 11.843 12.5166 12.6824 12.5166 13.7178V14.7607C12.5166 15.7961 11.6769 16.6355 10.6416 16.6357H9.58984C8.55431 16.6357 7.71484 15.7963 7.71484 14.7607V13.7178C7.71484 12.6822 8.55431 11.8428 9.58984 11.8428H10.6416ZM15.7793 5.99219C16.7241 5.99219 17.1967 5.99193 17.5576 6.17578C17.875 6.3375 18.1331 6.59576 18.2949 6.91309C18.4788 7.27406 18.4795 7.74729 18.4795 8.69238V9.28906C18.4795 10.2339 18.4787 10.7064 18.2949 11.0674C18.1331 11.3849 17.8751 11.6439 17.5576 11.8057C17.1967 11.9895 16.7241 11.9893 15.7793 11.9893H15.1816C14.2369 11.9893 13.7642 11.9895 13.4033 11.8057C13.0858 11.6439 12.8278 11.3849 12.666 11.0674C12.4822 10.7064 12.4824 10.2339 12.4824 9.28906V8.69238C12.4824 7.74729 12.4821 7.27406 12.666 6.91309C12.8278 6.59575 13.0859 6.3375 13.4033 6.17578C13.7642 5.99192 14.2368 5.99219 15.1816 5.99219H15.7793ZM5.20508 6.5918C6.24061 6.5918 7.08008 7.43126 7.08008 8.4668V9.50977C7.08008 10.5453 6.24061 11.3848 5.20508 11.3848H4.15332C3.11794 11.3846 2.27832 10.5452 2.27832 9.50977V8.4668C2.27832 7.43138 3.11794 6.59198 4.15332 6.5918H5.20508ZM9.21094 0C10.1556 0 10.6283 -9.0893e-05 10.9893 0.183594C11.3068 0.34538 11.5658 0.604352 11.7275 0.921875C11.9112 1.28278 11.9111 1.75558 11.9111 2.7002V3.29688C11.9111 4.24151 11.9112 4.71429 11.7275 5.0752C11.5658 5.39272 11.3068 5.65169 10.9893 5.81348C10.6283 5.99716 10.1556 5.99707 9.21094 5.99707H8.61426C7.66917 5.99707 7.19594 5.9974 6.83496 5.81348C6.51754 5.65168 6.2594 5.39264 6.09766 5.0752C5.91398 4.71428 5.91406 4.24154 5.91406 3.29688V2.7002C5.91406 1.75555 5.91399 1.28279 6.09766 0.921875C6.2594 0.604429 6.51754 0.345388 6.83496 0.183594C7.19594 -0.00033275 7.66917 0 8.61426 0H9.21094ZM21.7812 0C22.726 0 23.1986 -0.000246176 23.5596 0.183594C23.8771 0.34538 24.1351 0.604352 24.2969 0.921875C24.4806 1.28281 24.4814 1.75539 24.4814 2.7002V3.29688C24.4814 4.2417 24.4806 4.71426 24.2969 5.0752C24.1351 5.39272 23.8771 5.65169 23.5596 5.81348C23.1987 5.99731 22.726 5.99707 21.7812 5.99707H21.1836C20.2388 5.99707 19.7662 5.99732 19.4053 5.81348C19.0877 5.65169 18.8298 5.39272 18.668 5.0752C18.4842 4.71426 18.4844 4.24169 18.4844 3.29688V2.7002C18.4844 1.7554 18.4842 1.28281 18.668 0.921875C18.8298 0.604352 19.0877 0.34538 19.4053 0.183594C19.7662 -0.000256015 20.2388 0 21.1836 0H21.7812Z" fill="white"/>',
      "</svg>",
    ].join("");
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"][type="image/svg+xml"]');
    if (link) {
      link.href = url;
    }
  }
  host.basePath = inferBasePath();
  applySettingsFromUrl(host as unknown as Parameters<typeof applySettingsFromUrl>[0]);
  syncTabWithLocation(host as unknown as Parameters<typeof syncTabWithLocation>[0], true);
  syncThemeWithSettings(host as unknown as Parameters<typeof syncThemeWithSettings>[0]);
  attachThemeListener(host as unknown as Parameters<typeof attachThemeListener>[0]);
  window.addEventListener("popstate", host.popStateHandler);
  // Load saved thread descriptors if the host implements it
  host.initThreadsFromStorage?.();
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
      host.syncPaneStatesFromLayout?.();
    }
  } else {
    // Fall back to localStorage split layout
    host.restoreSplitLayout?.();
  }
  // Ensure we always have a split layout (single-leaf for non-split mode).
  // During HMR, prefer restoring from settings if a layout was saved, to preserve
  // the user's multi-pane arrangement (e.g., grid) instead of collapsing to a
  // single column.
  if (!host.splitLayout) {
    const { createLeaf, deserializeLayout } = await import("./split-tree.js");
    const savedLayout = host.settings.splitLayout
      ? deserializeLayout(host.settings.splitLayout)
      : null;
    if (savedLayout) {
      host.splitLayout = savedLayout;
      host.focusedPaneId = savedLayout.focusedPaneId;
    } else {
      const leaf = createLeaf(host.sessionKey, "pane-initial");
      host.splitLayout = {
        root: leaf,
        focusedPaneId: leaf.id,
      };
      host.focusedPaneId = leaf.id;
    }
    host.syncPaneStatesFromLayout?.();
  }

  // Sync sessionKey to the focused pane so live state targets the right pane
  // after HMR / reload. Both URL and localStorage paths set focusedPaneId but
  // don't switch the active session.
  if (host.splitLayout && host.focusedPaneId) {
    const focusedLeaf = findLeaf(host.splitLayout.root, host.focusedPaneId);
    if (focusedLeaf) {
      host.sessionKey = focusedLeaf.threadId;
    }
  }
  startNodesPolling(host as unknown as Parameters<typeof startNodesPolling>[0]);
  startModelsPolling(host as unknown as Parameters<typeof startModelsPolling>[0]);
  // Load models immediately on connect
  void loadModels(host as unknown as Parameters<typeof loadModels>[0]);
  if (host.tab === "logs") {
    startLogsPolling(host as unknown as Parameters<typeof startLogsPolling>[0]);
  }
  if (host.tab === "debug") {
    startDebugPolling(host as unknown as Parameters<typeof startDebugPolling>[0]);
  }
  // Refresh chat when user returns to the tab (catches agent finishing while away)
  host.visibilityHandler = () => {
    if (document.visibilityState === "visible" && host.connected) {
      void refreshChat(host as unknown as Parameters<typeof refreshChat>[0]);
    }
  };
  document.addEventListener("visibilitychange", host.visibilityHandler);
}

export function handleFirstUpdated(host: LifecycleHost) {
  observeTopbar(host as unknown as Parameters<typeof observeTopbar>[0]);
  // Auto-focus handled in handleUpdated when connected transitions to true
}

export function handleDisconnected(host: LifecycleHost) {
  window.removeEventListener("popstate", host.popStateHandler);
  if (host.visibilityHandler) {
    document.removeEventListener("visibilitychange", host.visibilityHandler);
    host.visibilityHandler = null;
  }
  removeKeyboardShortcuts();
  stopNodesPolling(host as unknown as Parameters<typeof stopNodesPolling>[0]);
  stopLogsPolling(host as unknown as Parameters<typeof stopLogsPolling>[0]);
  stopModelsPolling(host as unknown as Parameters<typeof stopModelsPolling>[0]);
  stopDebugPolling(host as unknown as Parameters<typeof stopDebugPolling>[0]);
  detachThemeListener(host as unknown as Parameters<typeof detachThemeListener>[0]);
  host.topbarObserver?.disconnect();
  host.topbarObserver = null;
}

export function handleUpdated(host: LifecycleHost, changed: Map<PropertyKey, unknown>) {
  // Auto-focus the chat composer when the gateway first connects.
  // In split-pane mode, scope to the focused pane to avoid triggering
  // @focusin on the wrong pane (which would override the restored focus).
  if (
    host.tab === "chat" &&
    changed.has("connected") &&
    host.connected &&
    !changed.get("connected")
  ) {
    setTimeout(() => {
      let el: HTMLTextAreaElement | null = null;
      if (host.splitLayout && host.focusedPaneId) {
        const paneEl = document.querySelector(`.split-pane[data-pane-id="${host.focusedPaneId}"]`);
        el = paneEl?.querySelector<HTMLTextAreaElement>(".chat-compose textarea") ?? null;
      } else {
        el = document.querySelector<HTMLTextAreaElement>(".chat-compose textarea");
      }
      if (el && !el.disabled) {
        el.focus();
      }
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
      scheduleChatScroll(host as unknown as Parameters<typeof scheduleChatScroll>[0], force);
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

  // ── Reactive queue flush safety net ──────────────────────────────
  // If chatRunId just transitioned to null (run ended) and the queue
  // has items, trigger a flush.  This catches edge cases where the
  // primary flush chain (loadChatHistory → flushChatQueue) silently
  // fails — e.g. timing races, WS request hangs, or thread state
  // mismatches that swallow the terminal event.
  if (
    changed.has("chatRunId") &&
    !host.chatRunId &&
    changed.get("chatRunId") != null &&
    host.chatQueue.length > 0 &&
    host.connected &&
    !host.chatSending
  ) {
    // Delay slightly so the primary chain (which loads history first)
    // gets a chance to run before this fallback.
    setTimeout(() => {
      if (host.connected && !host.chatRunId && !host.chatSending && host.chatQueue.length > 0) {
        console.log(
          "[CHAT-QUEUE] Safety-net flush: queue has",
          host.chatQueue.length,
          "item(s) after chatRunId cleared",
        );
        void flushChatQueueForEvent(
          host as unknown as Parameters<typeof flushChatQueueForEvent>[0],
        );
      }
    }, 1500);
  }
}
