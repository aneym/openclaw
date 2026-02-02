---
name: sync-claude-config
description: Audit and sync Claude Code config (skills, rules, hooks) against official docs
argument-hint: [skills|rules|hooks|settings|all]
allowed-tools: Read, Edit, Write, Glob, Grep, AskUserQuestion, Task
---

## Context

### Target Scope

!`echo "${ARGUMENTS:-all}"`

### Project Skills

!`ls -1 .claude/skills/*/SKILL.md 2>/dev/null | sed 's|.*/skills/||; s|/SKILL.md||' || echo "None"`

### Project Rules

!`ls -1 .claude/rules/*.md 2>/dev/null | xargs -I{} basename {} .md || echo "None"`

### Project Hooks

!`ls -1 .claude/hooks/*.js 2>/dev/null | xargs -I{} basename {} || echo "None"`

### Settings Files

!`ls -la .claude/settings*.json 2>/dev/null | awk '{print $NF}' || echo "None"`

### Personal Skills

!`ls -1 ~/.claude/skills/*/SKILL.md 2>/dev/null | sed 's|.*/skills/||; s|/SKILL.md||' | head -10 || echo "None"`

### Personal Rules

!`ls -1 ~/.claude/rules/*.md 2>/dev/null | xargs -I{} basename {} .md | head -10 || echo "None"`

## Instructions

### Step 1: Fetch Latest Documentation

Use the `claude-code-guide` agent to get authoritative documentation:

```
Task(subagent_type="claude-code-guide", prompt="Fetch the latest Claude Code documentation on:
1. SKILL.md frontmatter - all valid fields
2. Rules frontmatter - paths: syntax
3. settings.json hooks format
4. Permission rule syntax
Return a concise validation checklist for each.")
```

### Step 2: Determine Scope

Parse `$ARGUMENTS` to determine what to audit:

| Argument        | Audit Targets                                          |
| --------------- | ------------------------------------------------------ |
| `skills`        | `.claude/skills/*/SKILL.md`                            |
| `rules`         | `.claude/rules/*.md`                                   |
| `hooks`         | `.claude/hooks/*.js` + settings.json hooks             |
| `settings`      | `.claude/settings.json`, `.claude/settings.local.json` |
| `all` (default) | Everything above                                       |

### Step 3: Audit Each Config Type

#### 3a. Audit Skills

For each `SKILL.md` file, validate:

**Frontmatter Fields (all optional but check usage):**

| Field                      | Valid Values                                 | Check                                  |
| -------------------------- | -------------------------------------------- | -------------------------------------- |
| `name`                     | lowercase, numbers, hyphens (max 64)         | Must match directory name              |
| `description`              | any string                                   | **Recommended** - enables auto-trigger |
| `argument-hint`            | e.g., `<file> [options]`                     | Format: `<required> [optional]`        |
| `disable-model-invocation` | `true`, `false`                              | Set `true` for side-effect skills      |
| `user-invocable`           | `true`, `false`                              | Set `false` for background knowledge   |
| `allowed-tools`            | comma-separated                              | Validate tool names exist              |
| `model`                    | `sonnet`, `opus`, `haiku`, or model ID       | Check valid alias                      |
| `context`                  | `fork`                                       | Only valid value                       |
| `agent`                    | `Explore`, `Plan`, `general-purpose`, custom | Requires `context: fork`               |
| `hooks`                    | object                                       | Validate hook structure                |

**Content Checks:**

- [ ] Has $ARGUMENTS if skill accepts input
- [ ] Pre-computed bash (exclamation prefix) commands are valid
- [ ] No deprecated commands/ references (use skills/)
- [ ] Under 500 lines (warn if over)
- [ ] Clear step-by-step instructions

**Tool Name Validation:**
Valid tools: `Read`, `Write`, `Edit`, `Glob`, `Grep`, `Bash`, `Bash(pattern:*)`, `WebFetch`, `WebSearch`, `Task`, `AskUserQuestion`, `Skill`, `mcp__*`

#### 3b. Audit Rules

For each `.md` rule file, validate:

**Frontmatter:**

- `paths:` must be array of glob patterns if present
- No other frontmatter fields supported

**Path Pattern Validation:**

```
✓ Valid: **/*.ts, src/**/*.tsx, {src,lib}/**/*
✗ Invalid: *.ts (missing **), **/* (too broad)
```

**Content Checks:**

- [ ] Under 500 lines
- [ ] No duplicate rules (same name in different locations)
- [ ] Clear, actionable guidance

#### 3c. Audit Hooks

**settings.json hook structure:**

```json
{
  "hooks": {
    "EventName": [
      {
        "matcher": "ToolPattern",
        "hooks": [{ "type": "command", "command": "...", "timeout": 60 }]
      }
    ]
  }
}
```

**Valid Event Names:**
`SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PermissionRequest`, `PostToolUse`, `PostToolUseFailure`, `Notification`, `SubagentStart`, `SubagentStop`, `Stop`, `PreCompact`, `Setup`, `SessionEnd`

**Matcher Patterns (for tool events):**

- Exact: `Write`, `Edit`
- Regex: `Write|Edit`, `mcp__supabase__.*`
- Required for: `PreToolUse`, `PermissionRequest`, `PostToolUse`, `PostToolUseFailure`
- Optional for: `Notification`, `SubagentStart`, `SubagentStop`, `PreCompact`, `Setup`

**Hook Script Validation (.js files):**

- [ ] Uses `process.stdin` to read JSON input
- [ ] Exit codes: 0 (ok), 2 (block), other (warn)
- [ ] No hardcoded paths (use `process.cwd()` or env vars)
- [ ] Handles JSON parse errors gracefully

#### 3d. Audit Settings

**settings.json structure:**

```json
{
  "permissions": { "allow": [], "ask": [], "deny": [] },
  "env": {},
  "hooks": {},
  "model": "string",
  "enabledPlugins": {},
  "sandbox": { "enabled": true }
}
```

**Permission Rule Syntax:**

```
Tool                    # Any use of tool
Tool(pattern)           # Tool with arg containing pattern
Tool(pattern:*)         # Tool with arg starting with pattern
Tool|OtherTool          # Either tool
mcp__server__tool       # MCP tool
```

### Step 4: Generate Report

Format findings as:

```markdown
# Claude Config Audit Report

## Summary

- Skills: X checked, Y issues
- Rules: X checked, Y issues
- Hooks: X checked, Y issues
- Settings: X issues

## 🔴 Critical (Blocks Functionality)

### [config-type] file-name

- **Issue**: Description
- **Expected**: What it should be
- **Current**: What it is
- **Fix**: Specific change needed

## 🟡 Warnings (Should Fix)

### [config-type] file-name

- **Issue**: Description
- **Fix**: How to fix

## 🟢 Deprecated (Update Recommended)

### [config-type] file-name

- **Issue**: Using deprecated pattern
- **Modern**: Updated approach

## ✅ Passing

- skill-name: Valid frontmatter, valid tools
- rule-name: Valid paths, focused content
```

### Step 5: Propose Fixes

For each issue, prepare the specific edit:

```markdown
## Proposed Fixes

### Fix 1: [file-path]

**Issue**: Missing description field
**Change**:
\`\`\`diff

---

name: skill-name

- description: What this skill does
  argument-hint: <args>

---

\`\`\`

### Fix 2: [file-path]

**Issue**: Invalid tool name
**Change**:
\`\`\`diff

- allowed-tools: Read, Wirte, Glob

* allowed-tools: Read, Write, Glob
  \`\`\`
```

### Step 6: Get Approval

Use `AskUserQuestion` to confirm:

```
Which fixes should I apply?

Options:
1. Apply all fixes
2. Apply critical only
3. Review each fix individually
4. Skip - just show report
```

### Step 7: Apply Approved Fixes

For each approved fix:

1. Read the current file
2. Apply the specific edit
3. Verify the change
4. Report completion

### Common Issues to Check

**Skills:**
| Issue | Detection | Severity |
|-------|-----------|----------|
| Missing `description` | No description field | Warning |
| Invalid tool name | Tool not in valid list | Critical |
| `name` ≠ directory | Mismatch | Warning |
| Missing `$ARGUMENTS` | Accepts args but no placeholder | Warning |
| Over 500 lines | Line count | Warning |
| Uses deprecated `commands/` | References old path | Deprecated |

**Rules:**
| Issue | Detection | Severity |
|-------|-----------|----------|
| Invalid `paths:` syntax | Not array or bad globs | Critical |
| Too broad paths (`**/*`) | Pattern match | Warning |
| Duplicate name | Same name in multiple dirs | Warning |

**Hooks:**
| Issue | Detection | Severity |
|-------|-----------|----------|
| Invalid event name | Not in valid list | Critical |
| Missing matcher (when required) | Tool event without matcher | Critical |
| Invalid JSON | Parse error | Critical |
| Hook script errors | Syntax/runtime errors | Critical |

**Settings:**
| Issue | Detection | Severity |
|-------|-----------|----------|
| Invalid permission syntax | Pattern doesn't match spec | Critical |
| Unknown top-level keys | Not in schema | Warning |
| Invalid JSON | Parse error | Critical |

### Step 8: Summary

After applying fixes, summarize:

```markdown
## Changes Applied

✅ Fixed 3 critical issues
✅ Fixed 5 warnings
⏭️ Skipped 2 deprecated patterns (manual review needed)

### Files Modified

- .claude/skills/foo/SKILL.md
- .claude/settings.json

### Remaining Issues

- [file]: Issue that needs manual review
```

$ARGUMENTS
