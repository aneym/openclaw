# SPEC: Interactive Components for Webchat

## Problem

When the agent shows actionable lists (Todoist tasks, email triage, approvals), users can only respond via text. There's no way to interact directly — check a box, click a button, submit choices.

## Goal

Let the agent emit structured interactive components that webchat renders as actual UI. User interacts, clicks "Done", and the selections are sent back to the agent as a message.

## Design Principles

1. **Webchat stays dumb** — no Todoist/Gmail/etc knowledge in the UI
2. **Agent defines everything** — schema, labels, actions, meaning
3. **Batch submit** — user interacts locally, then "Done" sends all state
4. **Channel-specific** — this is webchat only (other channels ignore or render as text fallback)

## Schema

Agent includes an `interactive` block in message content:

```json
{
  "role": "assistant",
  "content": [
    { "type": "text", "text": "Here are your tasks:" },
    {
      "type": "interactive",
      "id": "tasks-abc123",
      "elements": [
        { "kind": "checkbox", "id": "t1", "label": "Buy groceries", "checked": false },
        { "kind": "checkbox", "id": "t2", "label": "Call mom", "checked": true },
        { "kind": "button", "id": "refresh", "label": "Refresh", "style": "secondary" }
      ],
      "submitLabel": "Mark Complete",
      "cancelLabel": "Cancel"
    }
  ]
}
```

### Element Types

| kind       | props                                                | behavior                          |
| ---------- | ---------------------------------------------------- | --------------------------------- |
| `checkbox` | `id`, `label`, `checked?`, `disabled?`               | Toggle on/off                     |
| `button`   | `id`, `label`, `style?` (primary/secondary/danger)   | Immediate action (no Done needed) |
| `radio`    | `id`, `name`, `label`, `checked?`                    | Single select within group        |
| `select`   | `id`, `label`, `options: {value, label}[]`, `value?` | Dropdown                          |
| `text`     | `id`, `label`, `value?`, `placeholder?`              | Text input                        |

### Submit Payload

When user clicks "Done" (or `submitLabel`), webchat sends a user message:

```
[interactive:tasks-abc123]
t1: true
t2: false
```

Or as structured JSON (TBD based on what's easier to parse):

```json
{ "interactiveId": "tasks-abc123", "values": { "t1": true, "t2": false } }
```

Button clicks send immediately (no Done required):

```
[interactive:tasks-abc123:button:refresh]
```

## Implementation

### 1. Types (`ui/src/ui/types.ts` or new file)

```typescript
type InteractiveElement =
  | { kind: "checkbox"; id: string; label: string; checked?: boolean; disabled?: boolean }
  | { kind: "button"; id: string; label: string; style?: "primary" | "secondary" | "danger" }
  | { kind: "radio"; id: string; name: string; label: string; checked?: boolean }
  | {
      kind: "select";
      id: string;
      label: string;
      options: { value: string; label: string }[];
      value?: string;
    }
  | { kind: "text"; id: string; label: string; value?: string; placeholder?: string };

type InteractiveBlock = {
  type: "interactive";
  id: string;
  elements: InteractiveElement[];
  submitLabel?: string; // default: "Done"
  cancelLabel?: string; // default: "Cancel" (dismisses without sending)
};
```

### 2. Rendering (`ui/src/ui/chat/grouped-render.ts`)

Detect `type: "interactive"` blocks in message content. Render as a card with:

- Elements based on kind
- Local state tracking (Lit reactive properties or a Map)
- Done/Cancel buttons at bottom

```typescript
function renderInteractiveBlock(
  block: InteractiveBlock,
  onSubmit: (id: string, values: Record<string, unknown>) => void,
  onCancel: (id: string) => void,
  onButtonClick: (blockId: string, buttonId: string) => void,
) {
  // ... render elements, track state, wire up submit
}
```

### 3. State Management

Options:

- **Simple**: Store state in a `Map<string, Record<string, unknown>>` keyed by block id
- **Lit reactive**: Use `@state()` decorator if we make it a component

Since blocks are immutable once rendered (agent won't update them), simple Map is fine.

### 4. Action Routing

In `app-chat.ts` or a new controller:

```typescript
function submitInteractive(blockId: string, values: Record<string, unknown>) {
  const payload = `[interactive:${blockId}]\n${formatValues(values)}`;
  // Send as user message via existing sendChatMessage
  sendChatMessage(host, payload);
}

function handleButtonClick(blockId: string, buttonId: string) {
  const payload = `[interactive:${blockId}:button:${buttonId}]`;
  sendChatMessage(host, payload);
}
```

### 5. Agent Skill

Create `~/clawd/skills/interactive-components/SKILL.md` documenting:

- How to emit interactive blocks
- How to parse action payloads
- Examples for common patterns (task lists, approvals, forms)

## Files to Change

| File                                             | Change                                                         |
| ------------------------------------------------ | -------------------------------------------------------------- |
| `ui/src/ui/types.ts`                             | Add `InteractiveElement`, `InteractiveBlock` types             |
| `ui/src/ui/chat/grouped-render.ts`               | Add `renderInteractiveBlock`, integrate into message rendering |
| `ui/src/ui/chat/interactive-state.ts`            | New file: state management for interactive blocks              |
| `ui/src/ui/app-chat.ts`                          | Add `submitInteractive`, `handleButtonClick`                   |
| `ui/src/styles/chat.css`                         | Styles for interactive components                              |
| `~/clawd/skills/interactive-components/SKILL.md` | Agent-facing docs                                              |

## Fallback

For non-webchat channels (Telegram, Signal, etc.), the interactive block should render as plain text:

```
Here are your tasks:
☐ Buy groceries
☑ Call mom
[Refresh]

Reply with task numbers to complete (e.g., "1, 2")
```

This fallback happens agent-side (in the skill), not in the UI.

## Testing

1. Agent emits message with interactive block
2. Webchat renders checkboxes/buttons correctly
3. User toggles checkboxes, sees local state change
4. User clicks "Done" → message sent with values
5. Agent receives payload, parses it, acts on it
6. Button clicks send immediately

## Open Questions

1. **Message format**: Plain text markers vs JSON in message body?
2. **Disable after submit**: Should interactive blocks become read-only after Done?
3. **Multiple blocks per message**: Support multiple interactive blocks in one message?
4. **Validation**: Should agent be able to specify required fields?

## Milestones

1. **M1**: Types + basic checkbox rendering (no submit yet)
2. **M2**: State tracking + Done/Cancel buttons + submit payload
3. **M3**: All element types (radio, select, text, button)
4. **M4**: Styling + polish
5. **M5**: Skill documentation + integration examples

---

## Completion

When done, signal:

```
openclaw system event --text "Done: interactive components — webchat can now render checkboxes, buttons, and forms from agent messages" --mode now
```
