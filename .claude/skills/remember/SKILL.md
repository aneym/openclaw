---
name: remember
description: Place learned information in the correct location (CLAUDE.md, rules, skills, docs)
argument-hint: [what to remember - or blank to extract from conversation]
allowed-tools: Read, Write, Edit, Glob, Grep, AskUserQuestion
---

## Context

CLAUDE.md line count: !`wc -l CLAUDE.md | awk '{print $1}'`

Existing rules: !`ls -1 .claude/rules/ 2>/dev/null || echo "none"`

Existing skills: !`ls -1 .claude/skills/ 2>/dev/null || echo "none"`

## Decision Tree

```
Is this a workflow/procedure?          -> Create SKILL
Is this needed every session?          -> CLAUDE.md (if <500 lines)
Is this path/domain-specific?          -> RULE (with paths: frontmatter)
Is this reference documentation?       -> docs/
Is this file-specific context?         -> Code comment
```

## Destination Quick Reference

| Type               | Destination                  | Example                            |
| ------------------ | ---------------------------- | ---------------------------------- |
| Guard rail         | CLAUDE.md                    | "Never commit without permission"  |
| MCP patterns       | .claude/rules/mcp-name.md    | Railway deploy patterns            |
| Gateway-specific   | .claude/rules/ with paths    | Gateway config, protocol, sessions |
| UI-specific        | .claude/rules/ with paths    | Lit.js web UI patterns             |
| iOS/macOS-specific | .claude/rules/ with paths    | Swift/SwiftUI patterns             |
| Extension-specific | .claude/rules/ with paths    | Channel plugin patterns            |
| Workflow           | .claude/skills/name/SKILL.md | Release process                    |
| Reference docs     | docs/name.md                 | API schema                         |
| File context       | Code comment                 | Why polling vs webhooks            |

## Instructions

### Step 1: Identify What to Remember

If $ARGUMENTS is provided, use that as the information to remember.

If $ARGUMENTS is empty, scan the recent conversation for:

- Repeated corrections from the user (3+ times)
- Important patterns or constraints discovered
- Mistakes that should be prevented
- Useful context for future sessions

### Step 2: Classify the Information

Determine the best destination:

**CLAUDE.md** (root project guidance):

- Guard rails that apply to ALL work
- Core principles every session needs
- Only if currently under 500 lines

**Rule file** (.claude/rules/name.md):

- Domain-specific patterns (MCP tools, gateway, UI, channels)
- Information needed only when working on certain files
- Use `paths:` frontmatter to scope when the rule loads

**Skill** (.claude/skills/name/SKILL.md):

- Step-by-step workflows
- Procedures that should be invoked with /command
- Things that need to be done the same way every time

**docs/** folder:

- Reference documentation
- API schemas, architecture diagrams
- Information too long for CLAUDE.md

**Code comment**:

- File-specific context
- "Why" explanations for specific code decisions
- Related files/modules

### Step 3: Confirm with User

Before writing, confirm:

1. What you understood needs to be remembered
2. Where you plan to put it
3. Any existing content that will be affected

Use AskUserQuestion if there's ambiguity about destination.

### Step 4: Write or Update

**For CLAUDE.md or rules:**

- Match existing formatting style
- Keep entries concise
- Group with related content

**For new rules with path scoping:**

```yaml
---
paths:
  - src/gateway/**/*
  - src/agents/**/*
---
```

**For skills:**

- Follow frontmatter template from /write-skill
- Include clear step-by-step instructions

**For code comments:**

- Explain WHY, not WHAT
- Include relevant ticket/issue references

### Step 5: Verify

After writing:

1. Confirm the file was created/updated
2. For rules, verify path patterns are correct
3. For CLAUDE.md, check line count is still reasonable

$ARGUMENTS
