/**
 * Unread detection utilities.
 *
 * These are plain functions (not hooks) designed to be called from
 * event handlers and store actions. They read store state directly
 * via getState() rather than using React subscriptions.
 */

import type { PanelState } from "../types";
import { usePanelStore } from "../stores/panel-store";

/**
 * Check if a chat is currently visible to the user.
 * A chat is "visible" when ALL of:
 * 1. The Electron window is focused
 * 2. A panel containing that chatId is the focused panel
 * 3. The tab containing that chatId is the active tab
 */
export function isChatVisible(chatId: string, workspaceId: string): boolean {
  // 1. Is the window focused?
  if (!document.hasFocus()) return false;

  // 2. Get the focused panel for this workspace
  const panelStore = usePanelStore.getState();
  const focusedPanelId = panelStore.getFocusedPanelId(workspaceId);
  if (!focusedPanelId) return false;

  const layout = panelStore.layouts.get(workspaceId);
  if (!layout) return false;

  const focusedPanel = layout.panels.get(focusedPanelId) as PanelState | undefined;
  if (!focusedPanel || focusedPanel.type !== "chat") return false;

  // 3. Check if the focused panel's active content is this chatId
  // Tabbed panels: check active tab's contentId
  if (focusedPanel.tabs && focusedPanel.activeTabId) {
    const activeTab = focusedPanel.tabs.find((t) => t.id === focusedPanel.activeTabId);
    if (activeTab?.contentId === chatId) return true;
  }

  // Non-tabbed fallback: check panel data.chatId
  if (focusedPanel.data?.chatId === chatId) return true;

  return false;
}

/**
 * Find the chatId currently visible in the focused panel of a workspace.
 * Returns null if no chat is focused or the window isn't focused.
 */
export function getVisibleChatId(workspaceId: string): string | null {
  if (!document.hasFocus()) return null;

  const panelStore = usePanelStore.getState();
  const focusedPanelId = panelStore.getFocusedPanelId(workspaceId);
  if (!focusedPanelId) return null;

  const layout = panelStore.layouts.get(workspaceId);
  if (!layout) return null;

  const focusedPanel = layout.panels.get(focusedPanelId) as PanelState | undefined;
  if (!focusedPanel || focusedPanel.type !== "chat") return null;

  // Tabbed panels: active tab's contentId
  if (focusedPanel.tabs && focusedPanel.activeTabId) {
    const activeTab = focusedPanel.tabs.find((t) => t.id === focusedPanel.activeTabId);
    return activeTab?.contentId ?? null;
  }

  // Non-tabbed fallback
  return (focusedPanel.data?.chatId as string) ?? null;
}
