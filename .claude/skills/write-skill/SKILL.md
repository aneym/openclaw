---
name: write-skill
description: Create a new skill following best practices
argument-hint: <skill-name> [description]
allowed-tools: Read, Write, Glob, AskUserQuestion
---

## Reference

Existing skills: !`ls -1 .claude/skills/`

## Instructions

### Step 1: Gather Requirements

Ask the user (if not provided in $ARGUMENTS):

1. What should the skill do?
2. What inputs/arguments does it need?
3. Should it be project-level or personal?

### Step 2: Determine Location

| Type     | Location                         | When to Use                                                        |
| -------- | -------------------------------- | ------------------------------------------------------------------ |
| Project  | `.claude/skills/NAME/SKILL.md`   | References project rules, team conventions, project-specific tools |
| Personal | `~/.claude/skills/NAME/SKILL.md` | Generic workflows that work anywhere                               |

### Step 3: Write the Skill

**Template structure:**

```
---
name: skill-name
description: Short description for help
argument-hint: expected arguments here
allowed-tools: Read, Write, Glob
---

## Context

Current branch: !`git branch --show-current`

## Instructions

### Step 1: Do something
Instructions here

$ARGUMENTS
```

### Frontmatter Reference

| Field           | Required | Purpose                                            |
| --------------- | -------- | -------------------------------------------------- |
| `name`          | Yes      | Skill identifier (kebab-case)                      |
| `description`   | Yes      | Shows in `/help`                                   |
| `allowed-tools` | Yes      | Tools the skill can use                            |
| `argument-hint` | No       | Shows expected args                                |
| `model`         | No       | Override model (e.g., `claude-3-5-haiku-20241022`) |

**Note:** Omit `disable-model-invocation` (defaults to false) so Claude can invoke skills directly. Only set to `true` for skills with dangerous side effects.

### Allowed-Tools Patterns

```yaml
# Specific commands
allowed-tools: Bash(git add:*), Bash(git commit:*)

# All git commands
allowed-tools: Bash(git:*)

# Multiple tools
allowed-tools: Read, Write, Edit, Glob, Grep

# Ask user questions
allowed-tools: AskUserQuestion

# MCP tools
allowed-tools: mcp__supabase__*

# Spawn subagents
allowed-tools: Task
```

### Inline Bash Preprocessing

**Syntax:** exclamation mark + backtick + command + backtick

Commands run BEFORE Claude sees the skill. Output replaces the placeholder.

**CRITICAL GOTCHAS - The parser is aggressive:**

| Problem                     | Cause                               | Solution                                         |
| --------------------------- | ----------------------------------- | ------------------------------------------------ |
| Parse error near `>`        | Angle brackets in commands          | Avoid `<placeholder>` syntax entirely            |
| Shell redirect fails        | `2>/dev/null` not supported         | Remove redirects, let errors show                |
| Code block examples execute | Parser scans entire file            | Describe syntax in words, don't show raw pattern |
| Inline code triggers parser | Even backtick-bang-backtick in text | Spell out "exclamation + backtick" instead       |

**Safe commands:**

- `git branch --show-current`
- `ls -1 .claude/skills/`
- `cat package.json | jq -r .version`

**Unsafe patterns to avoid:**

- Anything with `<` or `>` characters
- Shell redirects (`2>/dev/null`, `> file.txt`)
- Complex pipes that might fail

### Arguments

Use `$ARGUMENTS` for the full argument string, or positional `$1`, `$2` (don't mix both).

### Best Practices

**Do:**

- Pre-compute context with inline bash
- Reference project rules dynamically
- Include $ARGUMENTS at the end
- Keep commands simple (no redirects)
- Test the skill after creating it

**Don't:**

- Use Bash(\*) without good reason
- Put inline bash examples in code blocks (they still execute)
- Use angle brackets in bash command placeholders
- Set disable-model-invocation: true unless necessary

### Step 4: Save and Test

1. Create directory: `.claude/skills/NAME/`
2. Save as `SKILL.md`
3. Test with `/skill-name`
4. If parse errors occur, check for problematic characters in inline bash

$ARGUMENTS
