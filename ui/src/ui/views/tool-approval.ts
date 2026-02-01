import { html, nothing } from "lit";

import type { AppViewState } from "../app-view-state";

function formatRemaining(ms: number): string {
  const remaining = Math.max(0, ms);
  const totalSeconds = Math.floor(remaining / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h`;
}

function formatToolInput(input: Record<string, unknown>): string {
  try {
    const text = JSON.stringify(input, null, 2);
    return text.length > 400 ? `${text.slice(0, 400)}...` : text;
  } catch {
    return "{}";
  }
}

function renderMetaRow(label: string, value?: string | null) {
  if (!value) return nothing;
  return html`<div class="exec-approval-meta-row"><span>${label}</span><span>${value}</span></div>`;
}

export function renderToolApprovalPrompt(state: AppViewState) {
  const active = state.toolApprovalQueue[0];
  if (!active) return nothing;
  const request = active.request;
  const remainingMs = active.expiresAtMs - Date.now();
  const remaining = remainingMs > 0 ? `expires in ${formatRemaining(remainingMs)}` : "expired";
  const queueCount = state.toolApprovalQueue.length;
  return html`
    <div class="exec-approval-overlay" role="dialog" aria-live="polite">
      <div class="exec-approval-card">
        <div class="exec-approval-header">
          <div>
            <div class="exec-approval-title">Tool approval needed</div>
            <div class="exec-approval-sub">${remaining}</div>
          </div>
          ${queueCount > 1
            ? html`<div class="exec-approval-queue">${queueCount} pending</div>`
            : nothing}
        </div>
        <div class="exec-approval-command mono">${request.toolName}</div>
        <div class="exec-approval-meta">
          ${renderMetaRow("Agent", request.agentId)}
          ${renderMetaRow("Session", request.sessionKey)}
        </div>
        ${Object.keys(request.toolInput).length > 0
          ? html`<pre class="tool-approval-input mono">${formatToolInput(request.toolInput)}</pre>`
          : nothing}
        ${state.toolApprovalError
          ? html`<div class="exec-approval-error">${state.toolApprovalError}</div>`
          : nothing}
        <div class="exec-approval-actions">
          <button
            class="btn primary"
            ?disabled=${state.toolApprovalBusy}
            @click=${() => state.handleToolApprovalDecision("allow-once")}
          >
            Allow once
          </button>
          <button
            class="btn"
            ?disabled=${state.toolApprovalBusy}
            @click=${() => state.handleToolApprovalDecision("allow-always")}
          >
            Always allow
          </button>
          <button
            class="btn danger"
            ?disabled=${state.toolApprovalBusy}
            @click=${() => state.handleToolApprovalDecision("deny")}
          >
            Deny
          </button>
        </div>
      </div>
    </div>
  `;
}
