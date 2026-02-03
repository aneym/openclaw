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
  surface?: string;
}

export interface NavThreadListProps {
  sessions: NavSessionEntry[];
  activeSessionKey: string;
  unreadCounts: Map<string, number>;
  runningSessions: Set<string>;
  /** Number of active sub-agents per requester session key. */
  subagentCounts: Map<string, number>;
  openPaneKeys: Set<string>;
  onSelect: (sessionKey: string) => void;
  onRename: (sessionKey: string, label: string) => void;
  onDelete: (sessionKey: string) => void;
  onArchive: (sessionKey: string) => void;
  onUnarchive: (sessionKey: string) => void;
  onNewSession: () => void;
  onOpenTerminal?: () => void;
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

/**
 * Clean up a raw title string — strip timestamps, Slack formatting,
 * WhatsApp headers, system prefixes, and other noise.
 */
function cleanTitle(raw: string): string {
  let t = raw.trim();
  // Strip "System: [2026-02-02 04:00:10 EST] ..." → keep text after bracket
  t = t.replace(/^System:\s*\[\d{4}-\d{2}-\d{2}\s+[\d:]+\s*\w*\]\s*/i, "");
  // Strip "[WhatsApp +1234 2026-02-02 07:32 EST] ..." → keep text after bracket
  t = t.replace(/^\[(?:WhatsApp|Signal|Telegram|iMessage)\s+\+?[\d\s()-]+\d{4}-\d{2}-\d{2}\s+[\d:]+\s*\w*\]\s*/i, "");
  // Strip "Slack thread #CHANNELID: " prefix
  t = t.replace(/^Slack\s+thread\s+#\S+:\s*/i, "");
  // Replace Slack user mentions <@U0ABC123> with @user
  t = t.replace(/<@[A-Z0-9]+>/g, "@user");
  // Replace Slack channel mentions <#C0ABC123|name> or <#C0ABC123>
  t = t.replace(/<#[A-Z0-9]+(?:\|([^>]+))?>/g, (_, name) => (name ? `#${name}` : "#channel"));
  // Strip "Cron: " prefix (already have cron indicator from channel)
  t = t.replace(/^Cron:\s*/i, "");
  // Strip leading ** (markdown bold) leftover
  t = t.replace(/^\*\*\s*/, "");
  // Strip trailing ** 
  t = t.replace(/\s*\*\*$/, "");
  // Collapse whitespace
  t = t.replace(/\s+/g, " ").trim();
  // If it's just a UUID-like string or very short hex, not useful
  if (/^[0-9a-f]{6,12}\s*\(\d{4}-\d{2}-\d{2}\)$/i.test(t)) {
    return "";
  }
  // Truncate to reasonable length
  if (t.length > 80) {
    t = t.slice(0, 77) + "…";
  }
  return t;
}

/** Clean + validate a session title for external use. */
export function cleanSessionTitle(raw: string | undefined): string {
  return isTitleUsable(raw);
}

/** Check if a raw title is too noisy to be useful as a primary label. */
function isTitleUsable(title: string | undefined): string {
  if (!title) return "";
  const cleaned = cleanTitle(title);
  // Too short after cleaning = not useful
  if (cleaned.length < 3) return "";
  return cleaned;
}

function sessionDisplayLabel(entry: NavSessionEntry): string {
  // Manual label always wins
  if (entry.label) return entry.label;
  // Try derived title (AI-generated summary), cleaned up
  const derived = isTitleUsable(entry.derivedTitle);
  if (derived) return derived;
  // Try display name, cleaned up
  const display = isTitleUsable(entry.displayName);
  if (display) return display;
  return humanizeSessionKey(entry.key);
}

/** Return a compact subtitle for the session (channel + context). */
function sessionSubtitle(entry: NavSessionEntry): string {
  const channel = extractChannel(entry);
  const channelLabel = channel ? channelDisplayName(channel) : "";

  // If we have a label, show derived title as subtitle (if different)
  if (entry.label) {
    const derived = isTitleUsable(entry.derivedTitle);
    if (derived && derived !== entry.label) return derived;
    return channelLabel;
  }
  // Otherwise just show channel info
  return channelLabel;
}

/** Extract channel name from session key, surface, or entry metadata. */
function extractChannel(entry: NavSessionEntry): string | null {
  if (entry.surface) return entry.surface;
  // NavSessionEntry doesn't carry channel/origin directly, so parse from key
  const parts = entry.key.split(":");
  if (parts[0] === "agent" && parts.length >= 3) {
    const ch = parts[2];
    if (ch === "main" && parts[3] === "thread") return "thread";
    if (ch === "cron") return "cron";
    return ch;
  }
  if (parts.length >= 2) return parts[0];
  return null;
}

const CHANNEL_ICONS: Record<string, string> = {
  slack: "💬",
  telegram: "✈️",
  whatsapp: "📱",
  discord: "🎮",
  signal: "🔒",
  imessage: "💬",
  bluebubbles: "💬",
  thread: "🧵",
  cron: "⏰",
  main: "💻",
};

function channelDisplayName(channel: string): string {
  const icon = CHANNEL_ICONS[channel.toLowerCase()] ?? "";
  const name = channel.charAt(0).toUpperCase() + channel.slice(1);
  return icon ? `${icon} ${name}` : name;
}

/** Turn a raw session key into a human-readable short label. */
export function humanizeSessionKey(key: string): string {
  const parts = key.split(":");

  // "agent:<id>:<channel>:..." patterns
  if (parts[0] === "agent" && parts.length >= 3) {
    const channel = parts[2];
    // Thread: "agent:main:main:thread:<uuid>" -> "New thread"
    if (parts[3] === "thread" && parts[4]) {
      return "New thread";
    }
    // Cron: "agent:main:cron:<uuid>" -> "Cron run"
    if (channel === "cron" && parts[3]) {
      return "Cron run";
    }
    // WhatsApp DM: "agent:main:whatsapp:dm:+1234" -> "WhatsApp chat"
    if (parts[3] === "dm") {
      const name = channel.charAt(0).toUpperCase() + channel.slice(1);
      return `${name} chat`;
    }
    // Channel group: "agent:main:slack:g-C1234" -> "Slack group"
    if (parts[3]?.startsWith("g-") || parts[3]?.startsWith("g:")) {
      const name = channel.charAt(0).toUpperCase() + channel.slice(1);
      return `${name} group`;
    }
    // Generic channel
    const name = channel.charAt(0).toUpperCase() + channel.slice(1);
    const rest = parts.slice(3).join(":");
    return rest ? `${name} session` : name;
  }

  // Simple keys: "slack:g-D0AD0Q06Z32" -> "Slack group"
  if (parts.length >= 2) {
    const channel = parts[0];
    const name = channel.charAt(0).toUpperCase() + channel.slice(1);
    const rest = parts.slice(1).join(":");
    if (rest.startsWith("g-") || rest.startsWith("g:")) return `${name} group`;
    return `${name} session`;
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
    subagentCounts,
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
                    const subagentCount = subagentCounts.get(s.key) ?? 0;
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
                        <div class="nav-thread-item__content">
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
                        ${(() => {
                          const sub = sessionSubtitle(s);
                          return sub
                            ? html`<span class="nav-thread-item__subtitle">${sub}</span>`
                            : nothing;
                        })()}
                        </div>
                        ${
                          unread > 0
                            ? html`<span class="nav-thread-item__unread" aria-label="${unread} unread">${unread}</span>`
                            : nothing
                        }
                        ${subagentCount > 0 ? html`
                          <span class="nav-thread-item__subagent" title="${subagentCount} sub-agent${subagentCount > 1 ? "s" : ""} working">
                            <span class="nav-thread-item__subagent-dot"></span>
                            ${subagentCount}
                          </span>
                        ` : nothing}
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
