import { html, nothing } from "lit";
import { icons } from "../icons.js";

/* ── Types ── */

export interface CodingSession {
  id: string;
  taskId: string;
  title: string;
  status: "starting" | "running" | "waiting" | "done" | "error" | "aborted";
  branch: string;
  worktreeRelative: string;
  execSessionId?: string;
  startedAt: string;
  finishedAt?: string;
  summary?: string | null;
  error?: string | null;
}

export type Phase = "init" | "exploring" | "planning" | "building" | "testing" | "complete" | "error" | "idle";

export interface StreamEvent {
  type: string;
  subtype?: string;
  phase: Phase;
  icon: string;
  summary: string;
  toolName?: string;
  cost?: number;
  turns?: number;
  question?: string;
  toolUseId?: string;
}

export interface CodingPanelProps {
  sessions: CodingSession[];
  expanded: Set<string>;
  sessionEvents: Map<string, StreamEvent[]>;
  sessionPhases: Map<string, Phase>;
  terminalOpen: string | null;
  onToggleExpand: (id: string) => void;
  onKill: (id: string) => void;
  onClose: () => void;
  onRefresh: () => void;
  onOpenTerminal: (id: string) => void;
  onCloseTerminal: () => void;
  onAttachTerminal: (id: string) => void;
  onRespond: (id: string, text: string, toolUseId?: string) => void;
  pendingQuestions: Map<string, { question: string; toolUseId: string }>;
}

/* ── Stream-JSON Parser ── */

const EXPLORE_TOOLS = new Set(["Read", "Glob", "Grep", "Bash", "ListMcpResourcesTool", "ReadMcpResourceTool", "WebFetch", "WebSearch", "Skill", "ToolSearch"]);
const BUILD_TOOLS = new Set(["Edit", "Write", "NotebookEdit"]);
const TEST_PATTERNS = /\b(test|jest|vitest|mocha|pytest|cargo test|go test|npm test|pnpm test)\b/i;

function detectPhase(event: any): Phase {
  if (event.type === "system") return "init";
  if (event.type === "result") return event.subtype === "success" ? "complete" : "error";
  if (event.type === "assistant" && event.message?.content) {
    for (const block of event.message.content) {
      if (block.type === "tool_use") {
        if (block.name === "Task") return "planning"; // sub-agent dispatch = planning
        if (BUILD_TOOLS.has(block.name)) return "building";
        if (block.name === "Bash" || block.name === "bash") {
          const cmd = block.input?.command || "";
          if (TEST_PATTERNS.test(cmd)) return "testing";
          return "exploring";
        }
        if (EXPLORE_TOOLS.has(block.name)) return "exploring";
        return "exploring";
      }
      if (block.type === "text" && block.text) return "planning";
    }
  }
  return "idle";
}

function summarizeEvent(event: any): StreamEvent | null {
  if (event.type === "system" && event.subtype === "init") {
    return { type: "system", subtype: "init", phase: "init", icon: "⚙️", summary: "Session started" };
  }
  if (event.type === "system") return null; // skip hooks etc

  if (event.type === "result") {
    const cost = event.total_cost_usd ? `$${event.total_cost_usd.toFixed(2)}` : "";
    const turns = event.num_turns || 0;
    const dur = event.duration_ms ? `${Math.round(event.duration_ms / 1000)}s` : "";
    return {
      type: "result", phase: event.subtype === "success" ? "complete" : "error",
      icon: event.subtype === "success" ? "✅" : "❌",
      summary: `${event.subtype === "success" ? "Complete" : "Failed"} — ${turns} turns, ${dur}${cost ? `, ${cost}` : ""}`,
      cost: event.total_cost_usd, turns,
    };
  }

  if (event.type === "assistant" && event.message?.content) {
    const events: StreamEvent[] = [];
    for (const block of event.message.content) {
      if (block.type === "tool_use") {
        const name = block.name || "tool";
        const input = block.input || {};
        let summary = name;
        let icon = "🔧";
        let phase = detectPhase({ type: "assistant", message: { content: [block] } });

        if (name === "Read") {
          icon = "📖"; summary = `Read ${shortPath(input.file_path || input.path || "")}`;
        } else if (name === "Edit") {
          icon = "✏️"; summary = `Edit ${shortPath(input.file_path || input.path || "")}`;
        } else if (name === "Write") {
          icon = "📝"; summary = `Write ${shortPath(input.file_path || input.path || "")}`;
        } else if (name === "Bash" || name === "bash") {
          icon = "⚡"; summary = (input.command || "").slice(0, 80);
        } else if (name === "Glob") {
          icon = "🔍"; summary = `Search: ${input.pattern || ""}`;
        } else if (name === "Grep") {
          icon = "🔍"; summary = `Grep: ${input.pattern || input.query || ""}`;
        } else if (name === "Task") {
          icon = "🔀"; summary = `Sub-agent: ${(input.prompt || input.task || "").slice(0, 60)}`;
        } else if (name === "AskUserQuestion") {
          icon = "❓"; summary = input.question || "Waiting for input…";
          return { type: "question", phase: "idle" as Phase, icon, summary, toolName: name, question: input.question, toolUseId: block.id };
        } else if (name === "WebSearch") {
          icon = "🌐"; summary = `Search: ${input.query || ""}`;
        } else if (name === "Skill") {
          icon = "📚"; summary = `Skill: ${input.name || input.skill || ""}`;
        }

        events.push({ type: "tool", phase, icon, summary, toolName: name });
      } else if (block.type === "text" && block.text) {
        const text = block.text.trim();
        if (text.length > 0) {
          events.push({
            type: "thinking", phase: "planning", icon: "💭",
            summary: text.length > 120 ? text.slice(0, 120) + "…" : text,
          });
        }
      }
    }
    return events.length > 0 ? events[events.length - 1]! : null;
  }

  // Skip user messages (tool results) — they're noisy
  return null;
}

function shortPath(p: string): string {
  const parts = p.split("/");
  return parts.length > 3 ? "…/" + parts.slice(-3).join("/") : p;
}

// Strip ANSI/terminal escape sequences (from tmux PTY output)
function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "")
    .replace(/\x1b\][^\x07]*\x07/g, "")
    .replace(/\x1b\[[?!]?[0-9;]*[a-zA-Z]/g, "")
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");
}

// Extract JSON objects from a potentially messy line (tmux wraps JSON in control sequences)
function extractJson(line: string): any | null {
  const clean = stripAnsi(line);
  // Try the whole cleaned line first
  try { return JSON.parse(clean); } catch {}
  // Try to find a JSON object in the line
  const match = clean.match(/(\{"type":.+)/);
  if (match) {
    try { return JSON.parse(match[1]); } catch {}
  }
  return null;
}

export function parseStreamEvents(rawLines: string): StreamEvent[] {
  if (!rawLines) return [];
  const events: StreamEvent[] = [];
  for (const line of rawLines.split("\n")) {
    if (!line.trim()) continue;
    const raw = extractJson(line);
    if (!raw) continue;
    try {
      // For assistant messages, extract ALL tool uses (not just last)
      if (raw.type === "assistant" && raw.message?.content) {
        for (const block of raw.message.content) {
          if (block.type === "tool_use" || (block.type === "text" && block.text?.trim())) {
            const ev = summarizeEvent({ type: "assistant", message: { content: [block] } });
            if (ev) events.push(ev);
          }
        }
      } else {
        const ev = summarizeEvent(raw);
        if (ev) events.push(ev);
      }
    } catch { /* skip non-JSON */ }
  }
  return events;
}

export function detectCurrentPhase(events: StreamEvent[]): Phase {
  if (events.length === 0) return "idle";
  // Walk backward to find last meaningful phase
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].phase !== "idle") return events[i].phase;
  }
  return "idle";
}

/* ── Phase display ── */

const PHASE_META: Record<Phase, { icon: string; label: string; color: string }> = {
  idle: { icon: "⏳", label: "Waiting", color: "var(--text-secondary)" },
  init: { icon: "⚙️", label: "Starting", color: "var(--text-secondary)" },
  exploring: { icon: "🔍", label: "Exploring", color: "#60a5fa" },
  planning: { icon: "🧠", label: "Planning", color: "#c084fc" },
  building: { icon: "🔨", label: "Building", color: "#f59e0b" },
  testing: { icon: "🧪", label: "Testing", color: "#34d399" },
  complete: { icon: "✅", label: "Complete", color: "var(--success, #22c55e)" },
  error: { icon: "❌", label: "Error", color: "var(--error, #ef4444)" },
};

/* ── Elapsed time ── */

function elapsed(start: string, end?: string): string {
  const ms = (end ? new Date(end).getTime() : Date.now()) - new Date(start).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

/* ── Render: Session Card ── */

function renderSessionCard(session: CodingSession, props: CodingPanelProps) {
  const isExpanded = props.expanded.has(session.id);
  const isActive = session.status === "running" || session.status === "starting";
  const events = props.sessionEvents.get(session.id) || [];
  const phase = props.sessionPhases.get(session.id) || "idle";
  const pm = PHASE_META[phase];
  const lastEvent = events.length > 0 ? events[events.length - 1] : null;
  const turnCount = events.filter(e => e.type === "tool" || e.type === "thinking").length;

  return html`
    <div class="cs-card ${isActive ? "cs-card--active" : ""} cs-card--${session.status}">
      <!-- Header (always visible) -->
      <div class="cs-card__head" @click=${() => props.onToggleExpand(session.id)}>
        <div class="cs-card__phase" style="color:${pm.color}" title="${pm.label}">
          <span>${pm.icon}</span>
          ${isActive ? html`<span class="cs-card__pulse"></span>` : nothing}
        </div>
        <div class="cs-card__info">
          <div class="cs-card__title">${session.taskId}: ${session.title}</div>
          <div class="cs-card__meta">
            <span style="color:${pm.color};font-weight:600;">${pm.label}</span>
            <span>·</span>
            <span>${elapsed(session.startedAt, session.finishedAt)}</span>
            ${turnCount > 0 ? html`<span>·</span><span>${turnCount} steps</span>` : nothing}
          </div>
          ${!isExpanded && lastEvent
            ? html`<div class="cs-card__latest">${lastEvent.icon} ${lastEvent.summary}</div>`
            : nothing}
        </div>
        <div class="cs-card__actions">
          ${isActive ? html`
            <button class="cs-btn cs-btn--kill" @click=${(e: Event) => { e.stopPropagation(); props.onKill(session.id); }} title="Kill">✕</button>
          ` : nothing}
          <span class="cs-card__chevron ${isExpanded ? "cs-card__chevron--open" : ""}">${icons.chevronDown}</span>
        </div>
      </div>

      <!-- Expanded body -->
      ${isExpanded ? html`
        <div class="cs-card__body">
          <!-- Action buttons -->
          <div class="cs-card__toolbar">
            ${(session as any).tmuxSession ? html`
              <button class="cs-btn cs-btn--terminal" @click=${() => props.onAttachTerminal(session.id)} title="Open in Terminal.app">
                🖥️ Open Terminal
              </button>
            ` : nothing}
            ${session.execSessionId ? html`
              <button class="cs-btn" @click=${() => props.onOpenTerminal(session.id)} title="View output in panel">
                📋 Output
              </button>
            ` : nothing}
            <span class="cs-card__branch">${icons.gitBranch} ${session.branch}</span>
          </div>

          <!-- Event timeline -->
          <div class="cs-card__timeline">
            ${events.length === 0
              ? html`<div class="cs-card__empty">Waiting for output…</div>`
              : events.slice(-30).map(ev => html`
                <div class="cs-ev cs-ev--${ev.phase}">
                  <span class="cs-ev__icon">${ev.icon}</span>
                  <span class="cs-ev__text">${ev.summary}</span>
                </div>
              `)}
          </div>

          ${(() => {
            const q = props.pendingQuestions.get(session.id);
            if (!q) return nothing;
            return html`
              <div class="cs-question">
                <div class="cs-question__label">❓ Claude Code is asking:</div>
                <div class="cs-question__text">${q.question}</div>
                <div class="cs-question__input">
                  <input type="text" class="cs-question__field" placeholder="Type your answer…"
                    @keydown=${(e: KeyboardEvent) => {
                      if (e.key === "Enter") {
                        const input = e.target as HTMLInputElement;
                        if (input.value.trim()) {
                          props.onRespond(session.id, input.value.trim(), q.toolUseId);
                          input.value = "";
                        }
                      }
                    }} />
                  <button class="cs-btn cs-btn--terminal" @click=${(e: Event) => {
                    const input = (e.target as HTMLElement).previousElementSibling as HTMLInputElement;
                    if (input?.value?.trim()) {
                      props.onRespond(session.id, input.value.trim(), q.toolUseId);
                      input.value = "";
                    }
                  }}>Send</button>
                </div>
              </div>`;
          })()}
          ${session.error ? html`<div class="cs-card__error">${session.error}</div>` : nothing}
          ${session.summary ? html`<div class="cs-card__summary">${session.summary}</div>` : nothing}
        </div>
      ` : nothing}
    </div>`;
}

/* ── Render: Terminal Fullscreen View ── */

function renderTerminal(session: CodingSession, events: StreamEvent[], props: CodingPanelProps) {
  const phase = props.sessionPhases.get(session.id) || "idle";
  const pm = PHASE_META[phase];

  return html`
    <div class="cs-terminal">
      <div class="cs-terminal__head">
        <div class="cs-terminal__title">
          <span style="color:${pm.color}">${pm.icon} ${pm.label}</span>
          <span>—</span>
          <span>${session.taskId}: ${session.title}</span>
          <span style="color:var(--text-secondary)">· ${elapsed(session.startedAt, session.finishedAt)}</span>
        </div>
        <button class="cs-btn" @click=${props.onCloseTerminal} title="Close terminal">✕</button>
      </div>
      <div class="cs-terminal__body">
        ${events.length === 0
          ? html`<div class="cs-card__empty">Waiting for output…</div>`
          : events.map(ev => html`
            <div class="cs-tev cs-tev--${ev.phase}">
              <span class="cs-tev__icon">${ev.icon}</span>
              <span class="cs-tev__text">${ev.summary}</span>
            </div>
          `)}
      </div>
    </div>`;
}

/* ── Render: Main Panel ── */

export function renderCodingPanel(props: CodingPanelProps) {
  // If terminal view is open, render fullscreen
  if (props.terminalOpen) {
    const session = props.sessions.find(s => s.id === props.terminalOpen);
    if (session) {
      const events = props.sessionEvents.get(session.id) || [];
      return renderTerminal(session, events, props);
    }
  }

  const active = props.sessions.filter(s => s.status === "running" || s.status === "starting");
  const done = props.sessions.filter(s => s.status !== "running" && s.status !== "starting");

  return html`
    <div class="cs-panel">
      <div class="cs-panel__head">
        <div class="cs-panel__title">
          🧩 Code Sessions
          ${active.length > 0 ? html`<span class="cs-badge">${active.length}</span>` : nothing}
        </div>
        <div class="cs-panel__btns">
          <button class="cs-btn" @click=${props.onRefresh} title="Refresh">${icons.refreshCw}</button>
          <button class="cs-btn" @click=${props.onClose} title="Close">✕</button>
        </div>
      </div>
      <div class="cs-panel__body">
        ${props.sessions.length === 0 ? html`
          <div class="cs-panel__empty">
            <div style="font-size:32px;opacity:0.3;">🧩</div>
            <div>No coding sessions</div>
            <div style="font-size:11px;color:var(--text-secondary);">Ask me to work on a task to start one</div>
          </div>
        ` : nothing}
        ${active.length > 0 ? html`
          <div class="cs-section">
            <div class="cs-section__title">Active</div>
            ${active.map(s => renderSessionCard(s, props))}
          </div>
        ` : nothing}
        ${done.length > 0 ? html`
          <div class="cs-section">
            <div class="cs-section__title">History</div>
            ${done.map(s => renderSessionCard(s, props))}
          </div>
        ` : nothing}
      </div>
    </div>`;
}
