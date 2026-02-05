---
name: audit
description: Audit code against project standards
argument-hint: <file-or-description>
allowed-tools: Read, Glob, Grep, Bash(pnpm lint:*), Skill, Task, EnterPlanMode, ExitPlanMode, Write, Edit
---

## Context

### Current Directory

!`pwd`

### Files to Audit

!`echo "$ARGUMENTS"`

## Instructions

This audit dynamically reads rules and generates checklists from their current content. Never use stale hardcoded checklists.

### Step 1: Identify What You're Auditing

Determine the file types and patterns present:

| Pattern                               | Category                |
| ------------------------------------- | ----------------------- |
| `src/gateway/`                        | Gateway / Control Plane |
| `src/agents/`                         | Agent Runtime           |
| `src/cli/`, `src/commands/`           | CLI                     |
| `src/telegram/`, `src/discord/`, etc. | Channels                |
| `src/media/`                          | Media Pipeline          |
| `src/routing/`                        | Routing                 |
| `ui/src/`                             | Web Control UI (Lit.js) |
| `apps/ios/`, `apps/macos/`            | Swift Apps              |
| `apps/android/`                       | Kotlin App              |
| `extensions/`                         | Channel Plugins         |
| `docs/`                               | Documentation           |

### Step 2: Read & Extract Project Rules

Read the relevant rules for the file types. **Extract actionable checklist items** from each rule.

#### Rule Locations

**Project rules:**

```
.claude/rules/*.md
```

**Global rules (always apply):**

```
~/.claude/rules/*.md
```

#### How to Extract Checklists

When reading each rule, look for these sections and extract actionable items:

- "Checklist" or "Code Review Checklist"
- "Key Principles" or "Rules"
- "Do / Don't" or "Good / Bad"
- "Required" or "Must"
- Tables with compliance criteria

**Example extraction:**

```
Rule: coding-style.md
Extracted checks:
- [ ] Uses strict typing (no `any`)
- [ ] Follows naming conventions (camelCase functions, PascalCase types)
- [ ] Prefers early returns over deep nesting
```

### Step 3: Apply TypeScript/Node Checks

For all TypeScript code:

| Check          | What to Look For                                     |
| -------------- | ---------------------------------------------------- |
| Strict typing  | No `any`, proper interfaces                          |
| ESM compliance | `import`/`export`, no `require`                      |
| Error handling | Explicit catch blocks, no silent failures            |
| File length    | Under ~500 LOC (warn at 500+, flag at 800+)          |
| Security       | No hardcoded secrets, input validation at boundaries |
| Comments       | WHY not WHAT, no noise comments                      |

### Step 4: Apply Architecture Checks

For gateway/agent code:

| Check              | What to Look For                          |
| ------------------ | ----------------------------------------- |
| Session safety     | Append-only JSONL, no mutation of history |
| Config validation  | Zod schemas for config                    |
| Channel agnostic   | No channel-specific logic in shared code  |
| Plugin boundaries  | Extension deps in extension package.json  |
| WebSocket protocol | Typed frames, schema-validated            |

For UI code (Lit.js):

| Check          | What to Look For                    |
| -------------- | ----------------------------------- |
| Web components | Proper Lit patterns, not React      |
| Reactivity     | Uses `@property`/`@state` correctly |
| No inline SVGs | Uses icon libraries                 |

For Swift code (iOS/macOS):

| Check                 | What to Look For                                  |
| --------------------- | ------------------------------------------------- |
| Observation framework | `@Observable`/`@Bindable`, not `ObservableObject` |
| SwiftUI patterns      | Proper state management                           |

### Step 5: Deep Soundness Check

Beyond style/pattern checks, ask:

- Does the logic actually accomplish what it's supposed to?
- Are there gaps between implementation and intent?
- Are there obvious mistakes or half-finished logic?
- Does error handling cover realistic failure modes?
- Would a new AI agent understand this in 30 seconds?

### Step 6: Report Findings

```markdown
## Audit Results for [files]

### Rules Applied

- [List of rules read]

### Critical (Must Fix)

- [File:Line] Issue description
  - Source: rule-name
  - Fix: How to fix it

### Soundness Issues

- [File:Line] Issue description
  - Expected: What should happen
  - Actual: What the code does
  - Fix: How to correct it

### Warnings

- [File:Line] Issue description
  - Source: rule-name
  - Fix: How to fix it

### Auto-Fixable

- X issues (run `pnpm lint --fix`)

### Passing

- Summary of checks that passed
```

### Step 7: Write Fix Plan and Enter Plan Mode

If there are Critical or Soundness issues found:

1. **Enter plan mode** using `EnterPlanMode`
2. **Write a fix plan** to the plan file with this structure:

```markdown
# Audit Fix Plan

## Issues Found

### Critical

- [File:Line] — Brief description

### Soundness

- [File:Line] — Brief description

## Fix Plan

### Fix 1: [Title]

**File:** `path/to/file.ts`
**Lines:** X-Y
**Change:** Describe the exact code change (before → after)

### Fix 2: [Title]

...

## Auto-Fixable

- Run `pnpm lint --fix` (if applicable)
```

3. **Exit plan mode** using `ExitPlanMode` — this prompts the user to approve before any code changes are made

If there are **no Critical or Soundness issues** (only Warnings or Passing), skip plan mode and just present the audit report. No fixes needed.

$ARGUMENTS
