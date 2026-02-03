/**
 * Git Source Control panel — modeled after VSCode's SCM view.
 *
 * Layout:
 *  - Commit message textarea at top
 *  - Commit / Stage All & Commit buttons
 *  - Collapsible "Staged Changes" tree section
 *  - Collapsible "Changes" tree section
 *  - Inline diff viewer (opens when clicking a file)
 *  - Recent commits log (collapsible)
 */
import { html, nothing } from "lit";
import type { GitFileStatus, GitLogEntry } from "../types";

/* ------------------------------------------------------------------ */
/*  Self-contained Lucide SVG icons (inline attrs — always visible)    */
/* ------------------------------------------------------------------ */

const scmIcons = {
  gitBranch: html`
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <line x1="6" x2="6" y1="3" y2="15" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </svg>
  `,
  refresh: html`
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  `,
  plus: html`
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  `,
  minus: html`
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  `,
  undo: html`
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
    </svg>
  `,
  file: html`
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  `,
  check: html`
    <svg
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  `,
  commit: html`
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <circle cx="12" cy="12" r="4" />
      <line x1="1.05" y1="12" x2="7" y2="12" />
      <line x1="17.01" y1="12" x2="22.96" y2="12" />
    </svg>
  `,
};

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type GitViewProps = {
  loading: boolean;
  error: string | null;
  branch: string;
  files: GitFileStatus[];
  ahead: number;
  behind: number;
  logEntries: GitLogEntry[];
  logLoading: boolean;
  diff: string | null;
  diffLoading: boolean;
  diffStaged: boolean;
  commitMessage: string;
  committing: boolean;
  selectedPath: string | null;
  stagedCollapsed: boolean;
  changesCollapsed: boolean;
  logCollapsed: boolean;
  onRefresh: () => void;
  onLoadLog: () => void;
  onStage: (paths: string[]) => void;
  onUnstage: (paths: string[]) => void;
  onDiscard: (paths: string[]) => void;
  onCommit: () => void;
  onStageAllAndCommit: () => void;
  onCommitMessageChange: (next: string) => void;
  onViewDiff: (staged: boolean, path?: string) => void;
  onToggleStagedCollapsed: () => void;
  onToggleChangesCollapsed: () => void;
  onToggleLogCollapsed: () => void;
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Single-letter status badge like VSCode */
function statusLetter(index: string, working: string, forStaged: boolean): string {
  if (index === "?" && working === "?") {
    return "U";
  } // Untracked
  if (forStaged) {
    if (index === "A") {
      return "A";
    }
    if (index === "D") {
      return "D";
    }
    if (index === "R") {
      return "R";
    }
    if (index === "C") {
      return "C";
    }
    return "M";
  }
  if (working === "D") {
    return "D";
  }
  if (working === "M") {
    return "M";
  }
  if (index === "?" && working === "?") {
    return "U";
  }
  return "M";
}

function statusColor(letter: string): string {
  switch (letter) {
    case "M":
      return "var(--warn)";
    case "A":
      return "var(--ok)";
    case "D":
      return "var(--destructive)";
    case "R":
      return "var(--info)";
    case "C":
      return "var(--info)";
    case "U":
      return "var(--ok)";
    default:
      return "var(--muted)";
  }
}

function statusTooltip(letter: string): string {
  switch (letter) {
    case "M":
      return "Modified";
    case "A":
      return "Index Added";
    case "D":
      return "Deleted";
    case "R":
      return "Renamed";
    case "C":
      return "Copied";
    case "U":
      return "Untracked";
    default:
      return "Unknown";
  }
}

function isStaged(file: GitFileStatus): boolean {
  return file.index !== " " && file.index !== "?";
}

function isUnstaged(file: GitFileStatus): boolean {
  return file.working !== " " || (file.index === "?" && file.working === "?");
}

/** Split path into filename and directory */
function splitPath(path: string): { name: string; dir: string } {
  const idx = path.lastIndexOf("/");
  if (idx === -1) {
    return { name: path, dir: "" };
  }
  return { name: path.slice(idx + 1), dir: path.slice(0, idx + 1) };
}

function formatRelativeDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return iso;
  }
  const now = Date.now();
  const diff = now - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) {
    return "just now";
  }
  if (mins < 60) {
    return `${mins}m ago`;
  }
  const hours = Math.floor(mins / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  if (days < 30) {
    return `${days}d ago`;
  }
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/* ------------------------------------------------------------------ */
/*  Diff renderer                                                      */
/* ------------------------------------------------------------------ */

function renderDiffLine(line: string) {
  if (line.startsWith("+++") || line.startsWith("---")) {
    return html`<div class="scm-diff-line scm-diff-meta">${line}</div>`;
  }
  if (line.startsWith("@@")) {
    return html`<div class="scm-diff-line scm-diff-hunk">${line}</div>`;
  }
  if (line.startsWith("+")) {
    return html`<div class="scm-diff-line scm-diff-add">${line}</div>`;
  }
  if (line.startsWith("-")) {
    return html`<div class="scm-diff-line scm-diff-del">${line}</div>`;
  }
  return html`<div class="scm-diff-line">${line}</div>`;
}

/* ------------------------------------------------------------------ */
/*  Sub-renders                                                        */
/* ------------------------------------------------------------------ */

function renderFileRow(
  file: GitFileStatus,
  forStaged: boolean,
  isSelected: boolean,
  props: GitViewProps,
) {
  const letter = statusLetter(file.index, file.working, forStaged);
  const color = statusColor(letter);
  const tooltip = statusTooltip(letter);
  const { name, dir } = splitPath(file.path);

  return html`
    <div
      class="scm-file-row ${isSelected ? "scm-file-row--selected" : ""}"
      @click=${() => props.onViewDiff(forStaged, file.path)}
      title=${file.path}
    >
      <span class="scm-file-icon">${scmIcons.file}</span>
      <span class="scm-file-name">${name}</span>
      ${dir ? html`<span class="scm-file-dir">${dir}</span>` : nothing}
      <span class="scm-file-actions">
        ${
          forStaged
            ? html`
              <button
                class="scm-action-btn"
                title="Unstage"
                @click=${(e: Event) => {
                  e.stopPropagation();
                  props.onUnstage([file.path]);
                }}
              >${scmIcons.minus}</button>
            `
            : html`
              ${
                file.index !== "?"
                  ? html`
                <button
                  class="scm-action-btn"
                  title="Discard Changes"
                  @click=${(e: Event) => {
                    e.stopPropagation();
                    if (confirm(`Discard changes to ${file.path}? This cannot be undone.`)) {
                      props.onDiscard([file.path]);
                    }
                  }}
                >${scmIcons.undo}</button>
              `
                  : nothing
              }
              <button
                class="scm-action-btn"
                title="Stage"
                @click=${(e: Event) => {
                  e.stopPropagation();
                  props.onStage([file.path]);
                }}
              >${scmIcons.plus}</button>
            `
        }
      </span>
      <span
        class="scm-status-badge"
        style="color: ${color}"
        title=${tooltip}
      >${letter}</span>
    </div>
  `;
}

function renderSectionHeader(
  label: string,
  count: number,
  collapsed: boolean,
  onToggle: () => void,
  actions?: ReturnType<typeof html>,
) {
  return html`
    <div class="scm-section-header" @click=${onToggle}>
      <span class="scm-chevron">${collapsed ? "▸" : "▾"}</span>
      <span class="scm-section-label">${label}</span>
      <span class="scm-section-count">${count}</span>
      ${actions ?? nothing}
    </div>
  `;
}

/* ------------------------------------------------------------------ */
/*  Main render                                                        */
/* ------------------------------------------------------------------ */

export function renderGit(props: GitViewProps) {
  const staged = props.files.filter(isStaged);
  const unstaged = props.files.filter(isUnstaged);
  const hasStagedFiles = staged.length > 0;
  const hasUnstagedFiles = unstaged.length > 0;
  const hasChanges = hasStagedFiles || hasUnstagedFiles;

  return html`
    <style>
      .scm-panel { max-width: 720px; }

      /* ── Header ── */
      .scm-header {
        display: flex; align-items: center; justify-content: space-between;
        padding: 8px 0; margin-bottom: 4px;
      }
      .scm-title {
        font-size: 11px; font-weight: 600; text-transform: uppercase;
        letter-spacing: 0.5px; color: var(--muted);
      }
      .scm-branch {
        display: flex; align-items: center; gap: 6px;
        font-size: 12px; color: var(--text);
      }
      .scm-branch-name { font-weight: 500; }
      .scm-branch-icon { width: 14px; height: 14px; opacity: 0.7; }
      .scm-ahead-behind { font-size: 11px; color: var(--muted); }
      .scm-header-actions { display: flex; gap: 4px; }
      .scm-icon-btn {
        background: none; border: none; cursor: pointer; padding: 4px;
        border-radius: var(--radius-sm); color: var(--text);
        display: flex; align-items: center; justify-content: center;
      }
      .scm-icon-btn:hover { background: var(--bg-hover); }
      .scm-icon-btn svg { width: 16px; height: 16px; }

      /* ── Commit Box ── */
      .scm-commit-box { margin-bottom: 12px; }
      .scm-commit-textarea {
        width: 100%; min-height: 68px; max-height: 200px; resize: vertical;
        background: var(--bg-elevated); border: 1px solid var(--border);
        border-radius: var(--radius-sm); padding: 8px 10px;
        color: var(--text); font-family: var(--font-body); font-size: 13px;
        line-height: 1.4; outline: none; box-sizing: border-box;
      }
      .scm-commit-textarea::placeholder { color: var(--muted); }
      .scm-commit-textarea:focus { border-color: var(--accent); }
      .scm-commit-buttons { display: flex; gap: 4px; margin-top: 6px; }
      .scm-commit-btn {
        flex: 1; padding: 6px 12px; border: none;
        border-radius: var(--radius-sm); font-size: 12px; font-weight: 500;
        cursor: pointer; background: var(--accent); color: var(--accent-foreground);
        font-family: var(--font-body);
      }
      .scm-commit-btn:hover { background: var(--accent-hover); }
      .scm-commit-btn:disabled { opacity: 0.4; cursor: not-allowed; }
      .scm-commit-btn--secondary {
        background: var(--bg-elevated); color: var(--text);
        border: 1px solid var(--border);
      }
      .scm-commit-btn--secondary:hover { background: var(--bg-hover); }

      /* ── Section Headers ── */
      .scm-section-header {
        display: flex; align-items: center; gap: 6px;
        padding: 4px 8px; cursor: pointer; user-select: none;
        font-size: 11px; font-weight: 600; text-transform: uppercase;
        letter-spacing: 0.3px; color: var(--text);
      }
      .scm-section-header:hover { background: var(--bg-hover); border-radius: var(--radius-sm); }
      .scm-chevron { font-size: 10px; width: 12px; text-align: center; flex-shrink: 0; color: var(--muted); }
      .scm-section-label { flex: 1; }
      .scm-section-count {
        font-size: 10px; font-weight: 600;
        background: var(--bg-muted); padding: 1px 6px; border-radius: var(--radius-full);
        color: var(--muted);
      }
      .scm-section-actions { display: flex; gap: 2px; margin-left: auto; }
      .scm-section-action-btn {
        background: none; border: none; cursor: pointer; padding: 2px;
        border-radius: var(--radius-sm); color: var(--muted);
        display: flex; align-items: center; opacity: 0;
        transition: opacity var(--duration-fast);
      }
      .scm-section-header:hover .scm-section-action-btn { opacity: 1; }
      .scm-section-action-btn:hover { color: var(--text); background: var(--bg-hover); }
      .scm-section-action-btn svg { width: 14px; height: 14px; }

      /* ── File Rows ── */
      .scm-file-list { padding-left: 0; }
      .scm-file-row {
        display: flex; align-items: center; gap: 6px;
        padding: 3px 8px 3px 26px; cursor: pointer;
        font-size: 13px; border-radius: var(--radius-sm);
      }
      .scm-file-row:hover { background: var(--bg-hover); }
      .scm-file-row--selected { background: var(--accent-subtle); }
      .scm-file-row--selected:hover { background: var(--accent-subtle); }
      .scm-file-icon { flex-shrink: 0; width: 16px; height: 16px; color: var(--muted); }
      .scm-file-icon svg { width: 16px; height: 16px; }
      .scm-file-name {
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        color: var(--text);
      }
      .scm-file-dir {
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        color: var(--muted); font-size: 12px; margin-left: 4px;
        flex-shrink: 1; min-width: 0;
      }
      .scm-file-actions {
        display: flex; gap: 2px; margin-left: auto;
        opacity: 0; transition: opacity var(--duration-fast); flex-shrink: 0;
      }
      .scm-file-row:hover .scm-file-actions { opacity: 1; }
      .scm-action-btn {
        background: none; border: none; cursor: pointer; padding: 2px;
        border-radius: var(--radius-sm); color: var(--text);
        display: flex; align-items: center;
      }
      .scm-action-btn:hover { background: var(--bg-hover); }
      .scm-action-btn svg { width: 14px; height: 14px; }
      .scm-status-badge {
        flex-shrink: 0; font-size: 11px; font-weight: 700;
        width: 16px; text-align: center; font-family: var(--mono);
      }

      /* ── Empty State ── */
      .scm-empty { padding: 24px 16px; text-align: center; color: var(--muted); font-size: 13px; }
      .scm-empty-icon { margin-bottom: 8px; opacity: 0.4; }
      .scm-empty-icon svg { width: 32px; height: 32px; }

      /* ── Diff Viewer ── */
      .scm-diff-container {
        margin-top: 8px; border: 1px solid var(--border);
        border-radius: var(--radius-md); overflow: hidden;
      }
      .scm-diff-header {
        display: flex; align-items: center; justify-content: space-between;
        padding: 6px 12px; background: var(--bg-elevated);
        border-bottom: 1px solid var(--border);
        font-size: 12px; color: var(--text);
      }
      .scm-diff-header-path { font-family: var(--mono); font-size: 12px; }
      .scm-diff-header-badge {
        font-size: 10px; padding: 1px 6px; border-radius: var(--radius-sm);
        background: var(--bg-muted); color: var(--muted);
      }
      .scm-diff-body {
        overflow: auto; max-height: 500px;
        font-family: var(--mono); font-size: 12px; line-height: 1.6;
      }
      .scm-diff-line { padding: 0 12px; white-space: pre; min-height: 1.6em; }
      .scm-diff-add { background: var(--ok-subtle); color: var(--ok); }
      .scm-diff-del { background: var(--danger-subtle); color: var(--destructive); }
      .scm-diff-hunk { color: var(--info); background: rgba(59, 130, 246, 0.08); }
      .scm-diff-meta { color: var(--muted); font-weight: 600; }

      /* ── Log ── */
      .scm-log-row {
        display: flex; align-items: baseline; gap: 8px;
        padding: 3px 8px 3px 26px; font-size: 13px;
      }
      .scm-log-row:hover { background: var(--bg-hover); border-radius: var(--radius-sm); }
      .scm-log-hash { font-family: var(--mono); color: var(--accent); font-size: 12px; flex-shrink: 0; }
      .scm-log-message {
        flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        color: var(--text);
      }
      .scm-log-meta { font-size: 11px; color: var(--muted); white-space: nowrap; flex-shrink: 0; }

      /* ── Error ── */
      .scm-error {
        padding: 8px 12px; margin-bottom: 8px;
        background: var(--danger-subtle); border: 1px solid var(--destructive);
        border-radius: var(--radius-sm); font-size: 12px; color: var(--destructive);
      }

      /* ── Divider ── */
      .scm-divider { height: 1px; background: var(--border); margin: 4px 0; }
    </style>

    <div class="scm-panel">
      <!-- Header -->
      <div class="scm-header">
        <div style="display: flex; align-items: center; gap: 10px;">
          <span class="scm-title">Source Control</span>
          <div class="scm-branch">
            <span class="scm-branch-icon">${scmIcons.gitBranch}</span>
            <span class="scm-branch-name">${props.branch || "—"}</span>
            ${
              props.ahead > 0 || props.behind > 0
                ? html`<span class="scm-ahead-behind">
                  ${props.ahead > 0 ? `↑${props.ahead}` : ""}${props.ahead > 0 && props.behind > 0 ? " " : ""}${props.behind > 0 ? `↓${props.behind}` : ""}
                </span>`
                : nothing
            }
          </div>
        </div>
        <div class="scm-header-actions">
          <button
            class="scm-icon-btn"
            title="Refresh"
            ?disabled=${props.loading}
            @click=${props.onRefresh}
          >${scmIcons.refresh}</button>
        </div>
      </div>

      ${props.error ? html`<div class="scm-error">${props.error}</div>` : nothing}

      <!-- Commit input -->
      <div class="scm-commit-box">
        <textarea
          class="scm-commit-textarea"
          placeholder="Message (Ctrl+Enter to commit on &quot;${props.branch || "main"}&quot;)"
          .value=${props.commitMessage}
          @input=${(e: Event) => props.onCommitMessageChange((e.target as HTMLTextAreaElement).value)}
          @keydown=${(e: KeyboardEvent) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && props.commitMessage.trim()) {
              e.preventDefault();
              props.onCommit();
            }
          }}
        ></textarea>
        <div class="scm-commit-buttons">
          <button
            class="scm-commit-btn"
            ?disabled=${props.committing || !props.commitMessage.trim() || !hasStagedFiles}
            @click=${props.onCommit}
            title=${!hasStagedFiles ? "No staged changes to commit" : "Commit staged changes"}
          >
            ${props.committing ? "Committing…" : "✓ Commit"}
          </button>
          ${
            hasUnstagedFiles && props.commitMessage.trim()
              ? html`
                <button
                  class="scm-commit-btn scm-commit-btn--secondary"
                  ?disabled=${props.committing}
                  @click=${props.onStageAllAndCommit}
                  title="Stage all changes and commit"
                >
                  Stage All & Commit
                </button>
              `
              : nothing
          }
        </div>
      </div>

      ${
        !hasChanges && !props.loading
          ? html`
            <div class="scm-empty">
              <div class="scm-empty-icon">${scmIcons.check}</div>
              No changes detected in working tree.
            </div>
          `
          : nothing
      }

      <!-- Staged Changes -->
      ${
        hasStagedFiles
          ? html`
            ${renderSectionHeader(
              "Staged Changes",
              staged.length,
              props.stagedCollapsed,
              props.onToggleStagedCollapsed,
              html`
                <span class="scm-section-actions" @click=${(e: Event) => e.stopPropagation()}>
                  <button
                    class="scm-section-action-btn"
                    title="Unstage All"
                    @click=${() => props.onUnstage(staged.map((f) => f.path))}
                  >${scmIcons.minus}</button>
                </span>
              `,
            )}
            ${
              !props.stagedCollapsed
                ? html`
                  <div class="scm-file-list">
                    ${staged.map((f) =>
                      renderFileRow(
                        f,
                        true,
                        props.selectedPath === f.path && props.diffStaged,
                        props,
                      ),
                    )}
                  </div>
                `
                : nothing
            }
            <div class="scm-divider"></div>
          `
          : nothing
      }

      <!-- Changes (unstaged + untracked) -->
      ${
        hasUnstagedFiles
          ? html`
            ${renderSectionHeader(
              "Changes",
              unstaged.length,
              props.changesCollapsed,
              props.onToggleChangesCollapsed,
              html`
                <span class="scm-section-actions" @click=${(e: Event) => e.stopPropagation()}>
                  <button
                    class="scm-section-action-btn"
                    title="Discard All Changes"
                    @click=${() => {
                      if (confirm("Discard ALL changes? This cannot be undone.")) {
                        props.onDiscard(unstaged.map((f) => f.path));
                      }
                    }}
                  >${scmIcons.undo}</button>
                  <button
                    class="scm-section-action-btn"
                    title="Stage All"
                    @click=${() => props.onStage(unstaged.map((f) => f.path))}
                  >${scmIcons.plus}</button>
                </span>
              `,
            )}
            ${
              !props.changesCollapsed
                ? html`
                  <div class="scm-file-list">
                    ${unstaged.map((f) =>
                      renderFileRow(
                        f,
                        false,
                        props.selectedPath === f.path && !props.diffStaged,
                        props,
                      ),
                    )}
                  </div>
                `
                : nothing
            }
            <div class="scm-divider"></div>
          `
          : nothing
      }

      <!-- Diff viewer -->
      ${
        props.diff !== null
          ? html`
            <div class="scm-diff-container">
              <div class="scm-diff-header">
                <span class="scm-diff-header-path">
                  ${props.selectedPath || (props.diffStaged ? "All staged" : "All unstaged")}
                </span>
                <span class="scm-diff-header-badge">
                  ${props.diffStaged ? "staged" : "working tree"}
                </span>
              </div>
              ${
                props.diffLoading
                  ? html`
                      <div style="padding: 16px; text-align: center; color: var(--muted-color)">Loading diff…</div>
                    `
                  : props.diff
                    ? html`<div class="scm-diff-body">${props.diff.split("\n").map(renderDiffLine)}</div>`
                    : html`
                        <div style="padding: 16px; text-align: center; color: var(--muted-color)">No differences.</div>
                      `
              }
            </div>
          `
          : nothing
      }

      <!-- Recent Commits -->
      <div style="margin-top: 8px;">
        ${renderSectionHeader("Commits", props.logEntries.length, props.logCollapsed, () => {
          props.onToggleLogCollapsed();
          if (props.logCollapsed && props.logEntries.length === 0) {
            props.onLoadLog();
          }
        })}
        ${
          !props.logCollapsed
            ? props.logEntries.length > 0
              ? html`
                <div class="scm-log-list">
                  ${props.logEntries.map(
                    (entry) => html`
                      <div class="scm-log-row">
                        <span class="scm-log-hash">${entry.hashShort}</span>
                        <span class="scm-log-message">${entry.message}</span>
                        <span class="scm-log-meta">${formatRelativeDate(entry.date)}</span>
                      </div>
                    `,
                  )}
                </div>
              `
              : html`
                <div style="padding: 8px 26px; font-size: 12px; color: var(--muted-color);">
                  ${props.logLoading ? "Loading…" : "No commits loaded."}
                </div>
              `
            : nothing
        }
      </div>
    </div>
  `;
}
