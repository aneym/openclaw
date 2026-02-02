---
name: update-skill
description: Update an existing skill
argument-hint: <skill-name> [changes]
allowed-tools: Read, Edit, Glob, AskUserQuestion
---

## Context

### Available Project Skills

!`ls -la .claude/skills/*/SKILL.md 2>/dev/null | awk '{print $NF}' || echo "No project skills"`

### Available Personal Skills

!`ls -la ~/.claude/skills/*/SKILL.md 2>/dev/null | awk '{print $NF}' || echo "No personal skills"`

## Instructions

### Step 1: Find the Skill

Parse `$ARGUMENTS` for the skill name. Search in:

1. `.claude/skills/<name>/SKILL.md` (project)
2. `~/.claude/skills/<name>/SKILL.md` (personal)

If not found, list available skills and ask user to clarify.

### Step 2: Read Current Skill

Read the skill file and understand:

- Current frontmatter (name, allowed-tools, description, etc.)
- Current context/pre-computed values
- Current instructions

### Step 3: Understand Changes

From `$ARGUMENTS` or by asking the user:

- What should change?
- What's not working?
- What should be added/removed?

### Step 4: Apply Changes

Common updates:

**Add Pre-computed Context:**

```markdown
## Context

!`new-command-here`
```

**Add/Update Allowed Tools:**

```yaml
allowed-tools: ExistingTool, NewTool
```

**Add Arguments:**

```yaml
argument-hint: <arg1> [optional-arg]
```

**Fix Instructions:**

- Make steps clearer
- Add missing steps
- Remove unnecessary steps

### Step 5: Validate

Check the updated skill:

- [ ] Frontmatter is valid YAML
- [ ] `name` matches directory name
- [ ] `allowed-tools` includes all needed tools
- [ ] `!` prefix bash commands are valid
- [ ] Instructions are clear and ordered
- [ ] `$ARGUMENTS` is included if user input expected

### Step 6: Save

Edit the file in place. Show user the diff of changes.

### Common Fixes

**Skill runs slowly:**
-> Add `!` prefix pre-computation for expensive operations

**Skill asks too many questions:**
-> Pre-compute context that answers those questions

**Tool permission errors:**
-> Add missing tool to `allowed-tools`

**Doesn't match team conventions:**
-> Check existing skills for patterns

$ARGUMENTS
