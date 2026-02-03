/**
 * Interactive component types for webchat.
 *
 * Allows agents to emit structured interactive elements (checkboxes, buttons, etc.)
 * that users can interact with. User selections are batched and sent back to the
 * agent when they click "Done".
 */

// ── Element Types ───────────────────────────────────────────────────────────

export type CheckboxElement = {
  kind: "checkbox";
  id: string;
  label: string;
  checked?: boolean;
  disabled?: boolean;
};

export type ButtonElement = {
  kind: "button";
  id: string;
  label: string;
  style?: "primary" | "secondary" | "danger";
};

export type RadioElement = {
  kind: "radio";
  id: string;
  name: string;
  label: string;
  checked?: boolean;
};

export type SelectElement = {
  kind: "select";
  id: string;
  label: string;
  options: Array<{ value: string; label: string }>;
  value?: string;
};

export type TextElement = {
  kind: "text";
  id: string;
  label: string;
  value?: string;
  placeholder?: string;
};

export type InteractiveElement =
  | CheckboxElement
  | ButtonElement
  | RadioElement
  | SelectElement
  | TextElement;

// ── Block Type ──────────────────────────────────────────────────────────────

export type InteractiveBlock = {
  type: "interactive";
  id: string;
  elements: InteractiveElement[];
  submitLabel?: string; // default: "Done"
  cancelLabel?: string; // default: "Cancel"
};

// ── State Management ────────────────────────────────────────────────────────

/**
 * State for a single interactive block.
 * Tracks current values and whether it has been submitted/cancelled.
 */
export type InteractiveBlockState = {
  values: Record<string, unknown>;
  submitted: boolean;
  cancelled: boolean;
};

/** Module-scoped state store, keyed by block ID. */
const blockStates = new Map<string, InteractiveBlockState>();

/**
 * Get or initialize state for an interactive block.
 * Initializes values from the element defaults on first access.
 */
export function getBlockState(block: InteractiveBlock): InteractiveBlockState {
  let state = blockStates.get(block.id);
  if (!state) {
    const values: Record<string, unknown> = {};
    for (const el of block.elements) {
      switch (el.kind) {
        case "checkbox":
          values[el.id] = el.checked ?? false;
          break;
        case "radio":
          if (el.checked) {
            values[el.name] = el.id;
          }
          break;
        case "select":
          values[el.id] = el.value ?? "";
          break;
        case "text":
          values[el.id] = el.value ?? "";
          break;
        // buttons don't have persistent state
      }
    }
    state = { values, submitted: false, cancelled: false };
    blockStates.set(block.id, state);
  }
  return state;
}

/**
 * Update a value in the block state.
 */
export function setBlockValue(blockId: string, key: string, value: unknown): void {
  const state = blockStates.get(blockId);
  if (state && !state.submitted && !state.cancelled) {
    state.values[key] = value;
  }
}

/**
 * Mark a block as submitted.
 */
export function markBlockSubmitted(blockId: string): void {
  const state = blockStates.get(blockId);
  if (state) {
    state.submitted = true;
  }
}

/**
 * Mark a block as cancelled.
 */
export function markBlockCancelled(blockId: string): void {
  const state = blockStates.get(blockId);
  if (state) {
    state.cancelled = true;
  }
}

/**
 * Check if a block is still interactive (not submitted or cancelled).
 */
export function isBlockInteractive(blockId: string): boolean {
  const state = blockStates.get(blockId);
  return state ? !state.submitted && !state.cancelled : true;
}

/**
 * Format values for submission as a user message.
 */
export function formatSubmitPayload(blockId: string, values: Record<string, unknown>): string {
  const lines = [`[interactive:${blockId}]`];
  for (const [key, value] of Object.entries(values)) {
    lines.push(`${key}: ${JSON.stringify(value)}`);
  }
  return lines.join("\n");
}

/**
 * Format a button click payload.
 */
export function formatButtonPayload(blockId: string, buttonId: string): string {
  return `[interactive:${blockId}:button:${buttonId}]`;
}

// ── Type Guards ─────────────────────────────────────────────────────────────

/**
 * Check if a content block is an interactive block.
 */
export function isInteractiveBlock(block: unknown): block is InteractiveBlock {
  if (typeof block !== "object" || block === null) return false;
  const b = block as Record<string, unknown>;
  return b.type === "interactive" && typeof b.id === "string" && Array.isArray(b.elements);
}

/**
 * Extract interactive blocks from message content.
 */
export function extractInteractiveBlocks(message: unknown): InteractiveBlock[] {
  const m = message as Record<string, unknown>;
  const content = m.content;
  const blocks: InteractiveBlock[] = [];

  if (Array.isArray(content)) {
    for (const block of content) {
      if (isInteractiveBlock(block)) {
        blocks.push(block);
      }
    }
  }

  return blocks;
}
