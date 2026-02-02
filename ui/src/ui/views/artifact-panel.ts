import { html, nothing } from "lit";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import type { ArtifactTab } from "../pane-state";
import { icons } from "../icons";
import { toSanitizedMarkdownHtml } from "../markdown";
import "../components/markdown-editor";

export type ArtifactPanelProps = {
  tabs: ArtifactTab[];
  activeTabId: string | null;
  onTabSelect: (tabId: string) => void;
  onTabClose: (tabId: string) => void;
  onRefresh: (tabId: string) => void;
  onToggleRaw: (tabId: string) => void;
  onCopy: (tabId: string) => void;
  onClose: () => void;
  onSave?: (tabId: string, content: string) => void;
  onAutoSave?: (tabId: string, content: string) => void;
};

function isMarkdownFile(fileName: string): boolean {
  const ext = fileName.slice(fileName.lastIndexOf(".")).toLowerCase();
  return ext === ".md" || ext === ".mdx";
}

function shortenPath(filePath: string): string {
  return filePath.replace(/\/Users\/[^/]+/g, "~").replace(/\/home\/[^/]+/g, "~");
}

function renderTabContent(tab: ArtifactTab, props: ArtifactPanelProps) {
  if (tab.loading) {
    return html`<div class="artifact-content artifact-content--loading">
      <span class="artifact-content__spinner">${icons.loader}</span>
    </div>`;
  }

  if (tab.error) {
    return html`<div class="artifact-content">
      <div class="artifact-content__error">${tab.error}</div>
    </div>`;
  }

  if (tab.content === null) {
    return html`
      <div class="artifact-content">
        <div class="artifact-content__empty">No content available</div>
      </div>
    `;
  }

  // Legacy tool output tab
  if (tab.isLegacy) {
    return html`<div class="artifact-content">
      <div class="artifact-markdown">
        ${unsafeHTML(toSanitizedMarkdownHtml(tab.content))}
      </div>
    </div>`;
  }

  const isMd = isMarkdownFile(tab.fileName);
  const editing = tab.editing ?? false;

  // Editing mode: textarea with the raw markdown
  if (editing) {
    const initValue = tab.editDraft ?? tab.content ?? "";
    return html`<div class="artifact-content artifact-content--editing">
      <markdown-editor
        .content=${initValue}
        @editor-update=${(e: CustomEvent) => {
          const md = e.detail.markdown;
          (tab as ArtifactTab & { editDraft?: string }).editDraft = md;
          props.onAutoSave?.(tab.id, md);
        }}
      ></markdown-editor>
    </div>`;
  }

  // Rendered markdown
  if (isMd) {
    return html`<div class="artifact-content">
      <div class="artifact-markdown">
        ${unsafeHTML(toSanitizedMarkdownHtml(tab.content))}
      </div>
    </div>`;
  }

  // Code/other files — raw in code fence
  const ext = tab.fileName.slice(tab.fileName.lastIndexOf(".")).toLowerCase();
  const langMap: Record<string, string> = {
    ".md": "markdown",
    ".json": "json",
    ".ts": "typescript",
    ".js": "javascript",
    ".py": "python",
    ".sh": "bash",
    ".yaml": "yaml",
    ".yml": "yaml",
    ".html": "html",
    ".css": "css",
    ".rs": "rust",
    ".go": "go",
  };
  const lang = langMap[ext] ?? "";
  const fenced = lang ? `\`\`\`${lang}\n${tab.content}\n\`\`\`` : `\`\`\`\n${tab.content}\n\`\`\``;

  return html`<div class="artifact-content">
    <div class="artifact-markdown">
      ${unsafeHTML(toSanitizedMarkdownHtml(fenced))}
    </div>
  </div>`;
}

export function renderArtifactPanel(props: ArtifactPanelProps) {
  const activeTab = props.tabs.find((t) => t.id === props.activeTabId) ?? props.tabs[0] ?? null;

  return html`
    <div class="artifact-panel">
      <!-- Header: close button + tabs -->
      <div class="artifact-header">
        <button
          class="artifact-header__close"
          @click=${props.onClose}
          title="Close panel"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
        <div class="artifact-tabs__list">
          ${props.tabs.map((tab) => {
            const isActive = tab.id === (activeTab?.id ?? null);
            return html`
              <button
                class="artifact-tab ${isActive ? "artifact-tab--active" : ""} ${tab.updated ? "artifact-tab--updated" : ""}"
                @click=${() => props.onTabSelect(tab.id)}
                title=${tab.isLegacy ? "Tool Output" : shortenPath(tab.filePath)}
              >
                <span class="artifact-tab__label">${tab.fileName}</span>
                <span
                  class="artifact-tab__close"
                  @click=${(e: Event) => {
                    e.stopPropagation();
                    props.onTabClose(tab.id);
                  }}
                  title="Close tab"
                >×</span>
              </button>
            `;
          })}
        </div>
      </div>

      ${
        activeTab
          ? html`
            ${renderTabContent(activeTab, props)}
            ${renderFooter(activeTab, props)}
          `
          : html`
              <div class="artifact-content">
                <div class="artifact-content__empty">No file selected</div>
              </div>
            `
      }
    </div>
  `;
}

function renderFooter(tab: ArtifactTab, props: ArtifactPanelProps) {
  const isLegacy = tab.isLegacy ?? false;
  const editing = tab.editing ?? false;
  const saving = tab.saving ?? false;

  return html`
    <div class="artifact-footer ${editing ? "artifact-footer--editing" : ""}">
      ${
        saving
          ? html`
              <span class="artifact-footer__status artifact-footer__status--saving">Saving…</span>
            `
          : editing
            ? html`<span class="artifact-footer__status artifact-footer__status--saved">${icons.check} Saved</span>`
            : nothing
      }
      ${
        !isLegacy
          ? html`<button class="artifact-footer__btn" @click=${() => props.onRefresh(tab.id)} title="Refresh from disk">${icons.loader} Refresh</button>`
          : nothing
      }
      <button class="artifact-footer__btn" @click=${() => props.onCopy(tab.id)} title="Copy">${icons.copy} Copy</button>
      <span class="artifact-footer__path">${tab.isLegacy ? "Tool Output" : shortenPath(tab.filePath)}</span>
    </div>
  `;
}
