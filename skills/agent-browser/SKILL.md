# agent-browser Skill

Headless browser automation CLI optimized for AI agents. Fast Rust CLI with accessibility tree snapshots.

## Installation

Already installed globally: `agent-browser` (v0.9.1)

## Quick Reference

```bash
# Open a page (headless by default)
agent-browser open <url>

# Get accessibility tree with refs (BEST FOR AI)
agent-browser snapshot

# Interact using refs from snapshot
agent-browser click @e2
agent-browser fill @e3 "text"
agent-browser type @e4 "text"

# Get information
agent-browser get text @e1
agent-browser get title
agent-browser get url

# Screenshots
agent-browser screenshot [path]
agent-browser screenshot --full  # Full page

# Close browser
agent-browser close
```

## Core Workflow

1. **Open page**: `agent-browser open <url>`
2. **Snapshot**: `agent-browser snapshot` → returns accessibility tree with `@eN` refs
3. **Act**: `agent-browser click @e5` or `agent-browser fill @e3 "value"`
4. **Repeat**: snapshot → act → snapshot → act
5. **Close**: `agent-browser close`

## Commands

### Navigation

- `agent-browser open <url>` — Navigate to URL
- `agent-browser close` — Close browser

### Interaction (use @refs from snapshot)

- `click <sel>` — Click element
- `dblclick <sel>` — Double-click
- `fill <sel> <text>` — Clear and fill input
- `type <sel> <text>` — Type into element (appends)
- `press <key>` — Press key (Enter, Tab, Escape, Control+a)
- `hover <sel>` — Hover over element
- `select <sel> <val>` — Select dropdown option
- `check <sel>` / `uncheck <sel>` — Checkbox
- `scroll <dir> [px]` — Scroll (up/down/left/right)
- `upload <sel> <files>` — Upload files

### Information

- `snapshot` — Get accessibility tree with refs (best for AI)
- `get text <sel>` — Get text content
- `get html <sel>` — Get innerHTML
- `get value <sel>` — Get input value
- `get title` — Get page title
- `get url` — Get current URL
- `screenshot [path]` — Take screenshot

### Semantic Locators (alternative to refs)

```bash
agent-browser find role button click --name "Submit"
agent-browser find text "Sign In" click
agent-browser find label "Email" fill "test@test.com"
```

### Wait

- `wait <selector>` — Wait for element visible
- `wait <ms>` — Wait milliseconds
- `wait --text "Welcome"` — Wait for text
- `wait --url "**/dashboard"` — Wait for URL pattern

## Example: Login Flow

```bash
agent-browser open https://app.example.com/login
agent-browser snapshot
# Output shows @e1=heading "Login", @e2=textbox "Email", @e3=textbox "Password", @e4=button "Sign In"
agent-browser fill @e2 "user@example.com"
agent-browser fill @e3 "password123"
agent-browser click @e4
agent-browser wait --url "**/dashboard"
agent-browser snapshot
```

## Tips

1. **Always snapshot first** — Get the current page state and refs
2. **Use @refs over CSS selectors** — More reliable for AI
3. **Headless by default** — Add `--headed` to see browser
4. **Runs in background** — Browser persists between commands until `close`

## vs OpenClaw Browser Tool

| Use Case                  | Recommendation   |
| ------------------------- | ---------------- |
| Quick automation via exec | agent-browser    |
| Integrated tool calls     | OpenClaw browser |
| Cron jobs / scripts       | agent-browser    |
| Complex multi-step flows  | Either works     |

## Troubleshooting

```bash
# Check if browser is running
agent-browser get url

# Force close stale browser
agent-browser close

# Reinstall Chromium
agent-browser install
```
