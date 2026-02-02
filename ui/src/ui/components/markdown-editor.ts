import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
/**
 * <markdown-editor> — Lit element wrapping TipTap for WYSIWYG markdown editing.
 *
 * Props:
 *   .content  — initial markdown string
 *   .readonly — disable editing (default false)
 *
 * Events:
 *   editor-update — fired on content change, detail: { markdown: string }
 *
 * Methods:
 *   getMarkdown() — returns current markdown string
 */
import { LitElement, html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { Markdown } from "tiptap-markdown";

@customElement("markdown-editor")
export class MarkdownEditor extends LitElement {
  @property({ type: String }) content = "";
  @property({ type: Boolean }) readonly = false;

  private editor: Editor | null = null;

  // Render into light DOM so parent styles (artifact-panel CSS) apply
  createRenderRoot() {
    return this;
  }

  firstUpdated() {
    const mount = this.querySelector(".md-editor-mount");
    if (!mount) {
      return;
    }

    this.editor = new Editor({
      element: mount as HTMLElement,
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3, 4] },
          codeBlock: { HTMLAttributes: { class: "md-code-block" } },
        }),
        Markdown.configure({
          html: false,
          transformCopiedText: true,
          transformPastedText: true,
        }),
      ],
      content: this.content,
      editable: !this.readonly,
      editorProps: {
        attributes: {
          class: "md-editor-content",
          spellcheck: "true",
        },
      },
      onUpdate: ({ editor }) => {
        this.dispatchEvent(
          new CustomEvent("editor-update", {
            detail: { markdown: editor.storage.markdown.getMarkdown() },
            bubbles: true,
            composed: true,
          }),
        );
      },
    });
  }

  updated(changed: Map<string, unknown>) {
    if (changed.has("readonly") && this.editor) {
      this.editor.setEditable(!this.readonly);
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.editor?.destroy();
    this.editor = null;
  }

  getMarkdown(): string {
    return this.editor?.storage.markdown.getMarkdown() ?? this.content;
  }

  render() {
    return html`
      <div class="md-editor-mount"></div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "markdown-editor": MarkdownEditor;
  }
}
