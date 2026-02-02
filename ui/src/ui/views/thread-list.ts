import type { TemplateResult } from "lit";
import { html, nothing } from "lit";
import { repeat } from "lit/directives/repeat.js";
import { setDragData } from "../split-dnd";

/** Compact relative time for thread sidebar (e.g. "3m", "2h", "5d") */
function compactAgo(ms?: number | null): string {
  if (!ms) {
    return "";
  }
  const diff = Date.now() - ms;
  if (diff < 0) {
    return "now";
  }
  const sec = Math.round(diff / 1000);
  if (sec < 60) {
    return `${sec}s`;
  }
  const min = Math.round(sec / 60);
  if (min < 60) {
    return `${min}m`;
  }
  const hr = Math.round(min / 60);
  if (hr < 24) {
    return `${hr}h`;
  }
  const day = Math.round(hr / 24);
  if (day < 30) {
    return `${day}d`;
  }
  const mo = Math.round(day / 30);
  return `${mo}mo`;
}

export interface NavSessionEntry {
  key: string;
  displayName?: string;
  label?: string;
  icon?: string;
  kind?: string;
  updatedAt?: number | null;
  derivedTitle?: string;
  archivedAt?: number;
}

export interface NavThreadListProps {
  sessions: NavSessionEntry[];
  activeSessionKey: string;
  unreadCounts: Map<string, number>;
  runningSessions: Set<string>;
  openPaneKeys: Set<string>;
  onSelect: (sessionKey: string) => void;
  onRename: (sessionKey: string, label: string) => void;
  onDelete: (sessionKey: string) => void;
  onArchive: (sessionKey: string) => void;
  onUnarchive: (sessionKey: string) => void;
  onNewSession: () => void;
  onRequestUpdate: () => void;
}

// Persist thread-group collapse state in localStorage
const THREAD_GROUPS_KEY = "openclaw.threadGroupsCollapsed";
const DEFAULT_COLLAPSED = ["Older", "Automated", "Archived"];

function loadCollapsedGroups(): Set<string> {
  try {
    const raw = localStorage.getItem(THREAD_GROUPS_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        return new Set(arr);
      }
    }
  } catch {
    /* ignore */
  }
  return new Set(DEFAULT_COLLAPSED);
}

function saveCollapsedGroups(groups: Set<string>) {
  try {
    localStorage.setItem(THREAD_GROUPS_KEY, JSON.stringify([...groups]));
  } catch {
    /* ignore */
  }
}

const collapsedGroups = loadCollapsedGroups();
const expandedGroups = new Set<string>();

// Module-level search state (persists across re-renders)
let threadSearchQuery = "";

// Module-level inline-rename state (survives Lit re-renders)
let renamingSessionKey: string | null = null;
let renamingValue = "";
let renamingOriginalLabel = "";
/** Whether to auto-focus/select the rename input on next render. */

const MAX_VISIBLE = 8;

function startInlineRename(sessionKey: string, currentLabel: string, onRequestUpdate: () => void) {
  renamingSessionKey = sessionKey;
  renamingValue = currentLabel;
  renamingOriginalLabel = currentLabel;
  onRequestUpdate();
  // Focus + select after Lit renders the input
  requestAnimationFrame(() => {
    const el = document.querySelector(".nav-thread-item__rename-input");
    el?.focus();
    el?.select();
  });
}

function commitInlineRename(
  onRename: (key: string, label: string) => void,
  onRequestUpdate: () => void,
) {
  const next = renamingValue.trim();
  const sessionKey = renamingSessionKey;
  const originalLabel = renamingOriginalLabel;
  renamingSessionKey = null;
  renamingValue = "";
  renamingOriginalLabel = "";
  if (sessionKey && next && next !== originalLabel) {
    onRename(sessionKey, next);
  }
  onRequestUpdate();
}

function cancelInlineRename(onRequestUpdate: () => void) {
  renamingSessionKey = null;
  renamingValue = "";
  renamingOriginalLabel = "";
  onRequestUpdate();
}

/** Check if a session is a cron/automated session */
function isCronSession(entry: NavSessionEntry): boolean {
  const key = entry.key.toLowerCase();
  return key.includes(":cron:") || key.includes(":cron-") || entry.kind === "global";
}

function sessionDisplayLabel(entry: NavSessionEntry): string {
  return entry.label || entry.displayName || humanizeSessionKey(entry.key);
}

/** Turn a raw session key into a human-readable short label. */
export function humanizeSessionKey(key: string): string {
  const parts = key.split(":");

  // "agent:<id>:<channel>:..." patterns
  if (parts[0] === "agent" && parts.length >= 3) {
    const channel = parts[2];
    // Thread: "agent:main:main:thread:<uuid>" -> "Thread ab12"
    if (parts[3] === "thread" && parts[4]) {
      return `Thread ${parts[4].slice(0, 6)}`;
    }
    // Cron: "agent:main:cron:<uuid>" -> "Cron ab12"
    if (channel === "cron" && parts[3]) {
      return `Cron ${parts[3].slice(0, 6)}`;
    }
    // Channel DM: "agent:main:telegram:dm:123" -> "Telegram dm:123"
    const rest = parts.slice(3).join(":");
    const name = channel.charAt(0).toUpperCase() + channel.slice(1);
    return rest ? `${name} ${rest.slice(0, 24)}` : name;
  }

  // Simple keys: "slack:U123" -> "Slack U123"
  if (parts.length >= 2) {
    const channel = parts[0];
    const rest = parts.slice(1).join(":");
    const name = channel.charAt(0).toUpperCase() + channel.slice(1);
    return `${name} ${rest.slice(0, 24)}`;
  }

  return key.slice(0, 30);
}

function matchesThreadSearch(entry: NavSessionEntry, needle: string): boolean {
  if (!needle) {
    return true;
  }
  const lower = needle.toLowerCase();
  return (
    (entry.displayName?.toLowerCase().includes(lower) ?? false) ||
    (entry.label?.toLowerCase().includes(lower) ?? false) ||
    (entry.derivedTitle?.toLowerCase().includes(lower) ?? false) ||
    entry.key.toLowerCase().includes(lower)
  );
}

interface SessionGroup {
  label: string;
  sessions: NavSessionEntry[];
}

const ACTIVE_THRESHOLD_MS = 1_200_000; // 20 minutes

function groupSessions(sessions: NavSessionEntry[], openPaneKeys?: Set<string>): SessionGroup[] {
  const now = Date.now();
  const active: NavSessionEntry[] = [];
  const older: NavSessionEntry[] = [];
  const archived: NavSessionEntry[] = [];
  const automated: NavSessionEntry[] = [];

  for (const s of sessions) {
    if (s.archivedAt) {
      archived.push(s);
    } else if (isCronSession(s)) {
      automated.push(s);
    } else if (
      (s.updatedAt && now - s.updatedAt < ACTIVE_THRESHOLD_MS) ||
      openPaneKeys?.has(s.key)
    ) {
      active.push(s);
    } else {
      older.push(s);
    }
  }

  const groups: SessionGroup[] = [];

  if (active.length > 0) {
    groups.push({ label: "Active", sessions: active });
  }
  if (older.length > 0) {
    groups.push({ label: "Older", sessions: older });
  }
  if (automated.length > 0) {
    groups.push({ label: "Automated", sessions: automated });
  }
  if (archived.length > 0) {
    groups.push({ label: "Archived", sessions: archived });
  }

  return groups;
}

export function renderNavThreadList(props: NavThreadListProps): TemplateResult {
  const {
    sessions,
    activeSessionKey,
    unreadCounts,
    runningSessions,
    openPaneKeys,
    onSelect,
    onRename,
    onDelete,
    onArchive,
    onUnarchive,
    onNewSession,
    onRequestUpdate,
  } = props;
  const filtered = threadSearchQuery
    ? sessions.filter((s) => matchesThreadSearch(s, threadSearchQuery))
    : sessions;
  const groups = groupSessions(filtered, openPaneKeys);

  return html`
    <div class="nav-threads">
      <button
        class="nav-thread-item nav-thread-item__new"
        @click=${onNewSession}
        title="Start a new session"
        aria-label="New session"
      >
        <span class="nav-thread-item__icon">+</span>
        <span class="nav-thread-item__new-label">New session</span>
      </button>
      <div class="nav-threads__search">
        <input
          class="nav-threads__search-input"
          type="text"
          placeholder="Search threads…"
          .value=${threadSearchQuery}
          @input=${(e: Event) => {
            threadSearchQuery = (e.target as HTMLInputElement).value;
            onRequestUpdate();
          }}
          aria-label="Search threads"
        />
        ${
          threadSearchQuery
            ? html`
          <button
            class="nav-threads__search-clear"
            @click=${() => {
              threadSearchQuery = "";
              onRequestUpdate();
            }}
            title="Clear search"
            aria-label="Clear search"
          >×</button>
        `
            : nothing
        }
      </div>
      ${
        groups.length === 0 && threadSearchQuery
          ? html`
        <div class="nav-threads__empty">No threads match "${threadSearchQuery}"</div>
      `
          : nothing
      }
      ${groups.map((group) => {
        const isCollapsed = collapsedGroups.has(group.label);
        const isFullyExpanded = expandedGroups.has(group.label);
        const allSessions = group.sessions;
        const visibleSessions =
          isFullyExpanded || allSessions.length <= MAX_VISIBLE
            ? allSessions
            : allSessions.slice(0, MAX_VISIBLE);
        const hiddenCount = allSessions.length - visibleSessions.length;
        const isArchivedGroup = group.label === "Archived";

        return html`
          <div class="nav-threads__group">
            <button
              class="nav-threads__group-label"
              @click=${() => {
                if (collapsedGroups.has(group.label)) {
                  collapsedGroups.delete(group.label);
                } else {
                  collapsedGroups.add(group.label);
                }
                saveCollapsedGroups(collapsedGroups);
                onRequestUpdate();
              }}
              title="${isCollapsed ? "Expand" : "Collapse"} ${group.label}"
            >
              <span class="nav-threads__group-chevron">${isCollapsed ? "▸" : "▾"}</span>
              <span class="nav-threads__group-text">${group.label}</span>
              ${group.label !== "Archived" ? html`<span class="nav-threads__group-count">${allSessions.length}</span>` : nothing}
            </button>
            ${
              !isCollapsed
                ? html`
              <div class="nav-threads__group-items">
                ${repeat(
                  visibleSessions,
                  (s) => s.key,
                  (s) => {
                    const isActive = s.key === activeSessionKey;
                    const isOpenInPane = openPaneKeys.has(s.key);
                    const isRunning = runningSessions.has(s.key);
                    const unread = unreadCounts.get(s.key) ?? 0;
                    const label = sessionDisplayLabel(s);
                    const isRenaming = renamingSessionKey === s.key;
                    return html`
                      <button
                        class="nav-thread-item ${isActive ? "nav-thread-item--active" : ""} ${isOpenInPane && !isActive ? "nav-thread-item--open" : ""} ${isRunning && !isActive ? "nav-thread-item--running" : ""}"
                        draggable="true"
                        @dragstart=${(e: DragEvent) => setDragData(e, s.key)}
                        @click=${() => {
                          if (!isRenaming) {
                            onSelect(s.key);
                          }
                        }}
                        title="${label}\n${s.key}"
                      >
                        ${
                          isRenaming
                            ? html`<input
                              class="nav-thread-item__rename-input"
                              .value=${renamingValue}
                              aria-label="Rename thread"
                              @input=${(e: Event) => {
                                renamingValue = (e.target as HTMLInputElement).value;
                              }}
                              @blur=${() => commitInlineRename(onRename, onRequestUpdate)}
                              @keydown=${(e: KeyboardEvent) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  (e.target as HTMLInputElement).blur();
                                }
                                if (e.key === "Escape") {
                                  e.preventDefault();
                                  cancelInlineRename(onRequestUpdate);
                                }
                              }}
                              @click=${(e: Event) => e.stopPropagation()}
                            />`
                            : html`<span
                              class="nav-thread-item__label"
                              @dblclick=${(e: Event) => {
                                e.stopPropagation();
                                startInlineRename(s.key, label, onRequestUpdate);
                              }}
                            >${label}</span>`
                        }
                        ${
                          unread > 0
                            ? html`<span class="nav-thread-item__unread" aria-label="${unread} unread">${unread}</span>`
                            : nothing
                        }
                        ${s.updatedAt ? html`<span class="nav-thread-item__time">${compactAgo(s.updatedAt)}</span>` : nothing}
                        ${
                          isArchivedGroup
                            ? html`<button
                              class="nav-thread-item__archive"
                              @click=${(e: Event) => {
                                e.stopPropagation();
                                onUnarchive(s.key);
                              }}
                              title="Unarchive session"
                              aria-label="Unarchive session"
                            ><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="1" width="12" height="4" rx="1"/><path d="M2 5v8a2 2 0 002 2h8a2 2 0 002-2V5"/><path d="M8 12V8m0 0l2 2m-2-2l-2 2"/></svg></button>`
                            : html`<button
                              class="nav-thread-item__archive"
                              @click=${(e: Event) => {
                                e.stopPropagation();
                                onArchive(s.key);
                              }}
                              title="Archive session"
                              aria-label="Archive session"
                            ><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="1" width="12" height="4" rx="1"/><path d="M2 5v8a2 2 0 002 2h8a2 2 0 002-2V5"/><path d="M8 8v4m0 0l2-2m-2 2l-2-2"/></svg></button>`
                        }
                        <button
                          class="nav-thread-item__delete"
                          @click=${(e: Event) => {
                            e.stopPropagation();
                            onDelete(s.key);
                          }}
                          title="Delete session"
                          aria-label="Delete session"
                        >×</button>
                      </button>
                    `;
                  },
                )}
                ${
                  hiddenCount > 0
                    ? html`
                  <button
                    class="nav-threads__show-more"
                    @click=${() => {
                      expandedGroups.add(group.label);
                      onRequestUpdate();
                    }}
                  >
                    Show all ${allSessions.length} sessions
                  </button>
                `
                    : nothing
                }
              </div>
            `
                : nothing
            }
          </div>
        `;
      })}
    </div>
  `;
}
