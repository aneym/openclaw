import type { Chat } from "../types";

export const ACTIVE_THRESHOLD_MS = 1_200_000; // 20 minutes (matches web UI)

export type ChatGroup = "Active" | "Older" | "Automated" | "Archived";

export interface GroupedChats {
  Active: Chat[];
  Older: Chat[];
  Automated: Chat[];
  Archived: Chat[];
}

/**
 * Groups chats by recency following web UI patterns.
 * - Active: lastMessageAt within 20 min OR currently open (non-cron only)
 * - Older: lastMessageAt > 20 min ago (non-cron only)
 * - Automated: cron/scheduled sessions
 * - Archived: status === 'archived'
 */
export function groupChatsByRecency(chats: Chat[], openChatIds?: Set<string>): GroupedChats {
  const now = Date.now();
  const active: Chat[] = [];
  const older: Chat[] = [];
  const automated: Chat[] = [];
  const archived: Chat[] = [];

  for (const chat of chats) {
    if (chat.status === "archived") {
      archived.push(chat);
    } else if (chat.isCron) {
      automated.push(chat);
    } else if (now - chat.lastMessageAt < ACTIVE_THRESHOLD_MS || openChatIds?.has(chat.id)) {
      active.push(chat);
    } else {
      older.push(chat);
    }
  }

  // Sort each group by lastMessageAt descending
  const sortByRecent = (a: Chat, b: Chat) => b.lastMessageAt - a.lastMessageAt;
  active.sort(sortByRecent);
  older.sort(sortByRecent);
  automated.sort(sortByRecent);
  archived.sort(sortByRecent);

  return { Active: active, Older: older, Automated: automated, Archived: archived };
}

export const CHAT_GROUPS: ChatGroup[] = ["Active", "Older", "Automated", "Archived"];
