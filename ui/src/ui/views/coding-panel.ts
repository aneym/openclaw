import { html, nothing } from "lit";
import { icons } from "../icons.js";

export interface CodingSession {
  id: string;
  taskId: string;
  title: string;
  description: string;
  status: "starting" | "running" | "waiting" | "done" | "error" | "aborted";
  branch: string;
  worktree: string;
  worktreeRelative: string;
  workspace: string;
  pid: number;
  startedAt: string;
  finishedAt?: string;
  progress: Array<{
    type: string;
    message: string;
    tool?: string;
    ts: string;
  }>;
  summary: string | null;
  filesChanged: string[];
  linesAdded: number;
  linesRemoved: number;
  error: string | null;
  prUrl?: string;
}

export interface CodingPanelProps {
  sessions: CodingSession[];
  expanded: Set<string>;
  onToggleExpand: (id: string) => void;
  onKill: (id: string) => void;
  onClose: () => void;
  onRefresh: () => void;
}

function statusIcon(status: string) {
  switch (status) {
    case "starting": return "⏳";
    case "running": return "🔨";
    case "waiting": return "⏸️";
    case "done": return "✅";
    case "error": return "❌";
    case "aborted": return "🛑";
    default: return "❓";
  }
}

function statusColor(status: string) {
  switch (status) {
    case "running": return "var(--accent)";
    case "done": return "var(--success, #22c55e)";
    case "error": return "var(--error, #ef4444)";
    case "aborted": return "var(--warning, #f59e0b)";
    default: return "var(--text-secondary)";
  }
}

function elapsed(start: string, end?: string) {
  const ms = (end ? new Date(end).getTime() : Date.now()) - new Date(start).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return `${m}m ${rem}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function renderProgressItem(item: { type: string; message: string; ts: string }) {
  return html`<div class="coding-progress-item">
    <span class="coding-progress-item__msg">${item.message}</span>
  </div>`;
}

function renderSessionCard(session: CodingSession, props: CodingPanelProps) {
  const isExpanded = props.expanded.has(session.id);
  const isActive = session.status === "running" || session.status === "starting" || session.status === "waiting";
  const recentProgress = session.progress.slice(-5);
  const lastProgress = session.progress[session.progress.length - 1];

  return html`
    <div class="coding-session-card ${isActive ? "coding-session-card--active" : ""} coding-session-card--${session.status}">
      <div class="coding-session-card__header" @click=${() => props.onToggleExpand(session.id)}>
        <div class="coding-session-card__status">
          <span class="coding-session-card__status-icon">${statusIcon(session.status)}</span>
          ${isActive
            ? html`<span class="coding-session-card__pulse"></span>`
            : nothing}
        </div>
        <div class="coding-session-card__info">
          <div class="coding-session-card__title">${session.taskId}: ${session.title}</div>
          <div class="coding-session-card__meta">
            <span style="color:${statusColor(session.status)}">${session.status}</span>
            · ${elapsed(session.startedAt, session.finishedAt)}
            · ${session.worktreeRelative || session.branch}
          </div>
          ${!isExpanded && lastProgress
            ? html`<div class="coding-session-card__last-progress">${lastProgress.message}</div>`
            : nothing}
        </div>
        <div class="coding-session-card__actions">
          ${isActive
            ? html`<button class="coding-session-card__btn coding-session-card__btn--kill" @click=${(e: Event) => { e.stopPropagation(); props.onKill(session.id); }} title="Kill session">
                ${icons.x}
              </button>`
            : nothing}
          <span class="coding-session-card__chevron ${isExpanded ? "coding-session-card__chevron--open" : ""}">
            ${icons.chevronDown}
          </span>
        </div>
      </div>

      ${isExpanded
        ? html`
          <div class="coding-session-card__body">
            ${session.status === "done" || session.status === "error"
              ? html`
                <div class="coding-session-card__summary">
                  ${session.summary
                    ? html`<div class="coding-session-card__summary-text">${session.summary}</div>`
                    : nothing}
                  ${session.error
                    ? html`<div class="coding-session-card__error">${session.error}</div>`
                    : nothing}
                  ${session.filesChanged.length > 0
                    ? html`
                      <div class="coding-session-card__files">
                        <strong>${session.filesChanged.length} files</strong>
                        <span class="coding-session-card__diff">
                          <span class="coding-session-card__diff--add">+${session.linesAdded}</span>
                          <span class="coding-session-card__diff--del">-${session.linesRemoved}</span>
                        </span>
                      </div>
                      <div class="coding-session-card__file-list">
                        ${session.filesChanged.map(f => html`<div class="coding-session-card__file">${f}</div>`)}
                      </div>`
                    : nothing}
                  ${session.prUrl
                    ? html`<div class="coding-session-card__pr"><a href="${session.prUrl}" target="_blank">View PR →</a></div>`
                    : nothing}
                </div>`
              : nothing}
            <div class="coding-session-card__progress">
              ${recentProgress.map(renderProgressItem)}
            </div>
            <div class="coding-session-card__footer">
              <span class="coding-session-card__branch">${icons.gitBranch} ${session.branch}</span>
            </div>
          </div>`
        : nothing}
    </div>`;
}

export function renderCodingPanel(props: CodingPanelProps) {
  const activeSessions = props.sessions.filter(s => s.status === "running" || s.status === "starting" || s.status === "waiting");
  const doneSessions = props.sessions.filter(s => s.status === "done" || s.status === "error" || s.status === "aborted");

  return html`
    <div class="coding-panel">
      <div class="coding-panel__header">
        <div class="coding-panel__title">
          <span class="coding-panel__title-icon">🧩</span>
          Code Sessions
          ${activeSessions.length > 0
            ? html`<span class="coding-panel__badge">${activeSessions.length}</span>`
            : nothing}
        </div>
        <div class="coding-panel__header-actions">
          <button class="coding-panel__btn" @click=${props.onRefresh} title="Refresh">
            ${icons.refreshCw}
          </button>
          <button class="coding-panel__btn" @click=${props.onClose} title="Close panel">
            ${icons.x}
          </button>
        </div>
      </div>

      <div class="coding-panel__body">
        ${props.sessions.length === 0
          ? html`<div class="coding-panel__empty">
              <div class="coding-panel__empty-icon">🧩</div>
              <div>No coding sessions</div>
              <div class="coding-panel__empty-hint">Ask your agent to "work on PAY-XXX" to start one</div>
            </div>`
          : nothing}

        ${activeSessions.length > 0
          ? html`
            <div class="coding-panel__section">
              <div class="coding-panel__section-title">Active</div>
              ${activeSessions.map(s => renderSessionCard(s, props))}
            </div>`
          : nothing}

        ${doneSessions.length > 0
          ? html`
            <div class="coding-panel__section">
              <div class="coding-panel__section-title">Completed</div>
              ${doneSessions.map(s => renderSessionCard(s, props))}
            </div>`
          : nothing}
      </div>
    </div>`;
}
