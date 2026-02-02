# SPEC: Webchat Slash Command Autocomplete

## Goal

Add a `/`-triggered autocomplete dropdown to the webchat composer. When the user types `/` at the start of a message, show a filterable list of available commands (built-in + skill commands). Selecting a command inserts it into the textarea.

## Architecture

### 1. Server → Client: Expose commands in hello-ok snapshot

**File:** `src/gateway/protocol/schema/snapshot.ts`
- Add a `SlashCommandEntrySchema` to the snapshot: `{ name: string, description: string, category?: string }`
- Add `slashCommands: Type.Optional(Type.Array(SlashCommandEntrySchema))` to `SnapshotSchema`

**File:** `src/gateway/server/health-state.ts` → `buildGatewaySnapshot()`
- Import `listChatCommandsForConfig` and `listSkillCommandsForAgents` 
- Build a merged, deduplicated command list
- Each entry: `{ name, description, category }` where category is "skill" or "system"
- Add to the returned snapshot object as `slashCommands`

### 2. Client: Store commands from snapshot

**File:** `ui/src/ui/types.ts` (or wherever `StatusSummary` / UI types live)
- Add `SlashCommandEntry` type: `{ name: string; description: string; category?: string }`

**File:** `ui/src/ui/app-gateway.ts` → `applySnapshot()`
- Read `snapshot.slashCommands` from the hello-ok payload
- Store on host as `host.slashCommands: SlashCommandEntry[]`

**File:** `ui/src/ui/app.ts`
- Add `@state() slashCommands: SlashCommandEntry[] = []` to the app element

### 3. Client: Autocomplete component

**New file:** `ui/src/ui/views/slash-autocomplete.ts`

Create a pure function `renderSlashAutocomplete(props)` that renders a dropdown overlay:

```typescript
type SlashAutocompleteProps = {
  visible: boolean;
  commands: SlashCommandEntry[];
  filter: string; // text after the "/"
  selectedIndex: number;
  onSelect: (command: SlashCommandEntry) => void;
};
```

**Rendering:**
- Absolutely positioned above the textarea (inside `.chat-compose`, positioned relative)
- Max height ~200px, scrollable
- Each item shows: `/<name>` (bold/mono) + description (muted)
- Skill commands get a subtle badge or different color
- Highlighted item has a distinct background
- Keyboard navigation: ↑/↓ to move, Enter/Tab to select, Escape to dismiss

### 4. Client: Wire into composer

**File:** `ui/src/ui/views/chat.ts` → `renderChat()`

Add autocomplete state tracking. The autocomplete is visible when:
- Draft starts with `/`
- User hasn't typed a space yet (still selecting the command name)
- There are matching commands

**Changes to the textarea:**
- On `@input`: if draft starts with `/` and no space yet, set autocomplete visible + filter
- On `@keydown`: 
  - If autocomplete visible and ↑/↓: prevent default, change selected index
  - If autocomplete visible and Enter/Tab: prevent default, insert selected command
  - If Escape: close autocomplete
- Render `renderSlashAutocomplete()` above the textarea when visible

**State management approach:** Since `renderChat` is a pure function (not a component), the autocomplete state should be managed via closure or passed through ChatProps. 

**Recommended:** Add these to ChatProps:
```typescript
slashCommands?: SlashCommandEntry[];
```

Then manage the autocomplete UI state (visible, filter, selectedIndex) locally inside the chat view using a small module-level state object keyed by session, OR by adding a thin wrapper. The simplest approach: use a module-scoped Map<string, autocompleteState> keyed on a stable identifier, updated on each render/input.

### 5. CSS

**File:** `ui/src/styles/chat/layout.css`

Add styles for:
- `.slash-autocomplete` — container (absolute, bottom: 100%, left: 0, width: 100%)
- `.slash-autocomplete__item` — each row
- `.slash-autocomplete__item--selected` — highlighted row
- `.slash-autocomplete__name` — command name (monospace)
- `.slash-autocomplete__desc` — description (muted)
- `.slash-autocomplete__badge` — optional "skill" badge

Match existing dark/light theme variables (`--bg`, `--panel`, `--border`, `--text-muted`, etc).

## Behavior Details

1. **Trigger:** `/` at position 0 of the draft (or after only whitespace — but simplest is position 0)
2. **Filter:** Everything after `/` up to the first space. Case-insensitive prefix match on command name.
3. **Dismiss:** Escape key, clicking outside, typing a space (command is "locked in"), or clearing the `/`
4. **Insert:** On select, replace the draft with `/<commandName> ` (with trailing space so user can type args)
5. **Scroll:** If filtered list is long, selected item should scroll into view
6. **Empty state:** If filter matches nothing, hide the dropdown (don't show "no results")

## Testing

- Verify commands appear in hello-ok snapshot
- Verify web UI receives and stores commands
- Verify `/` triggers dropdown, typing filters, arrow keys navigate, Enter selects
- Verify skill commands appear alongside built-in commands
- Verify it works in split-pane mode (each pane has its own composer)

## Files to modify

### Server
1. `src/gateway/protocol/schema/snapshot.ts` — add SlashCommandEntry schema + extend Snapshot
2. `src/gateway/server/health-state.ts` — populate slashCommands in buildGatewaySnapshot()

### Client
3. `ui/src/ui/types.ts` — add SlashCommandEntry type
4. `ui/src/ui/app-gateway.ts` — read slashCommands from snapshot
5. `ui/src/ui/app.ts` — store slashCommands state
6. `ui/src/ui/views/chat.ts` — wire autocomplete into composer, add to ChatProps
7. `ui/src/ui/views/slash-autocomplete.ts` — NEW: autocomplete dropdown component
8. `ui/src/styles/chat/layout.css` — autocomplete styles

## Notes

- The `SnapshotSchema` uses `additionalProperties: false` — MUST add the new field to the schema or it'll be stripped by validation
- The web UI uses Lit (lit-html templates), not React — use `html` tagged templates
- Theme: use existing CSS variables, don't hardcode colors
- Keep it simple — no fuzzy matching needed, prefix match is fine for v1
- The `listSkillCommandsForAgents()` function in `src/auto-reply/skill-commands.ts` already builds the full skill command list
