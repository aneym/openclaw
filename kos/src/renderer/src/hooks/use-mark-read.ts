/**
 * useMarkRead — Auto-clears unread state when a chat becomes visible.
 *
 * Watches for changes to:
 * - Focused panel ID (user clicks a different panel)
 * - Active tab (user switches tabs within a panel)
 * - Window focus (user brings the app to foreground)
 *
 * When the focused chat panel's active chatId has `hasUnread === true`,
 * clears it after a short debounce (avoids clearing while quickly tabbing).
 */

import { useEffect, useMemo, useRef } from "react";
import type { PanelState } from "../types";
import { getVisibleChatId } from "../lib/unread";
import { useChatStore } from "../stores/chat-store";
import { useNotificationStore } from "../stores/notification-store";
import { usePanelStore } from "../stores/panel-store";

const DEBOUNCE_MS = 300;

export function useMarkRead(workspaceId: string | undefined) {
  const markRead = useChatStore((s) => s.markRead);

  // Derive stable primitives from panel store instead of subscribing to full Maps.
  // This avoids re-running the effect on every layout resize or chat delta.
  const focusedPanelIds = usePanelStore((s) => s.focusedPanelIds);
  const layouts = usePanelStore((s) => s.layouts);

  const focusedPanelId = useMemo(
    () => (workspaceId ? (focusedPanelIds.get(workspaceId) ?? null) : null),
    [focusedPanelIds, workspaceId],
  );

  // Derive the active tab ID of the focused panel (changes when user switches tabs)
  const activeTabId = useMemo(() => {
    if (!workspaceId || !focusedPanelId) return null;
    const layout = layouts.get(workspaceId);
    if (!layout) return null;
    const panel = layout.panels.get(focusedPanelId) as PanelState | undefined;
    return panel?.activeTabId ?? null;
  }, [layouts, workspaceId, focusedPanelId]);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!workspaceId) return;

    const checkAndClear = () => {
      // Cancel pending debounce
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      timerRef.current = setTimeout(() => {
        const chatId = getVisibleChatId(workspaceId);
        if (!chatId) return;

        const chat = useChatStore.getState().chats.get(chatId);
        if (chat?.hasUnread) {
          markRead(chatId);

          // Update dock badge
          if (useNotificationStore.getState().dockBadgeEnabled) {
            const unreadCount = useChatStore.getState().getUnreadCount();
            window.api?.setDockBadge?.(unreadCount);
          }
        }
      }, DEBOUNCE_MS);
    };

    // Check immediately on mount / dependency change
    checkAndClear();

    // Also check when window regains focus
    const onFocus = () => checkAndClear();
    window.addEventListener("focus", onFocus);

    return () => {
      window.removeEventListener("focus", onFocus);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [workspaceId, markRead, focusedPanelId, activeTabId]);
}
