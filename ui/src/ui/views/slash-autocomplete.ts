import { html, nothing } from "lit";
import type { SlashCommandEntry } from "../ui-types";

export type SlashAutocompleteProps = {
  visible: boolean;
  commands: SlashCommandEntry[];
  filter: string;
  selectedIndex: number;
  onSelect: (command: SlashCommandEntry) => void;
};

export function renderSlashAutocomplete(props: SlashAutocompleteProps) {
  if (!props.visible || props.commands.length === 0) {
    return nothing;
  }

  const filtered = props.commands.filter((cmd) =>
    cmd.name.toLowerCase().startsWith(props.filter.toLowerCase()),
  );

  if (filtered.length === 0) {
    return nothing;
  }

  const selectedIdx = Math.min(props.selectedIndex, filtered.length - 1);

  return html`
    <div class="slash-autocomplete" role="listbox">
      ${filtered.map(
        (cmd, i) => html`
          <div
            class="slash-autocomplete__item ${i === selectedIdx ? "slash-autocomplete__item--selected" : ""}"
            role="option"
            aria-selected=${i === selectedIdx}
            @mousedown=${(e: Event) => {
              e.preventDefault();
              props.onSelect(cmd);
            }}
            @mouseenter=${(e: Event) => {
              // Update selected index on hover via a custom event
              const el = e.currentTarget as HTMLElement;
              el.dispatchEvent(
                new CustomEvent("slash-hover", {
                  bubbles: true,
                  composed: true,
                  detail: { index: i },
                }),
              );
            }}
          >
            <span class="slash-autocomplete__name">/${cmd.name}</span>
            <span class="slash-autocomplete__desc">${cmd.description}</span>
            ${
              cmd.category === "skill"
                ? html`<span class="slash-autocomplete__badge">skill</span>`
                : nothing
            }
          </div>
        `,
      )}
    </div>
  `;
}

/**
 * Get filtered commands based on current filter text.
 * Exported for keyboard navigation index clamping.
 */
export function getFilteredCommands(
  commands: SlashCommandEntry[],
  filter: string,
): SlashCommandEntry[] {
  return commands.filter((cmd) =>
    cmd.name.toLowerCase().startsWith(filter.toLowerCase()),
  );
}
