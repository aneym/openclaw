---
name: write-rule
description: Write a Claude Code rule by parsing docs and validating with MCPs
argument-hint: <rule-name> [topic/mcp to document]
allowed-tools: Read, Write, Glob, Grep, AskUserQuestion, Task, WebFetch, mcp__*
---

## Context

Existing rules: !`ls -1 .claude/rules/ 2>/dev/null || echo "No rules directory yet"`

## Instructions

You are creating a Claude Code rule file. Rules provide persistent context for specific topics, tools, or MCPs.

### Step 1: Gather Information

**Required inputs:**
1. **Rule name** - kebab-case identifier (e.g., `gateway-protocol`, `railway-deploy`)
2. **Topic** - What this rule covers (MCP, library, pattern, etc.)
3. **Documentation** - User may paste docs inline, or provide a URL
4. **Scope** - Is this global or file-specific? (see Step 1.5)

**If user provides a GitHub URL:**
- Convert to raw URL: `https://raw.githubusercontent.com/{owner}/{repo}/main/README.md`
- Fetch and parse the README for official documentation

**If user pastes docs inline:**
- Parse the pasted content for key patterns, gotchas, and examples

### Step 1.5: Determine Rule Scope & Location

**CRITICAL: Claude Code loads ALL rules by default.** Use `paths:` frontmatter to limit when a rule loads.

**Rule Location:**

All rules go in `.claude/rules/` since this is a single repository.

**Path Filtering Decision Tree:**

```
Is this rule relevant to ALL files in the codebase?
|- YES -> No paths needed (global rule)
|        Examples: Railway MCP, Git conventions, coding style
|
|- NO -> Add TARGETED paths (see warning below)
        |
        |- Gateway code? -> paths: ["src/gateway/**/*", "src/agents/**/*"]
        |- UI code? -> paths: ["ui/src/**/*"]
        |- iOS/macOS? -> paths: ["apps/ios/**/*", "apps/macos/**/*"]
        |- Android? -> paths: ["apps/android/**/*"]
        |- Extensions? -> paths: ["extensions/**/*"]
        |- CLI? -> paths: ["src/cli/**/*", "src/commands/**/*"]
        |- Channels? -> paths: ["src/telegram/**/*", "src/discord/**/*", "src/slack/**/*", "src/signal/**/*"]
        |- Media? -> paths: ["src/media/**/*"]
        |- Config? -> paths: ["src/config/**/*"]
```

> **Never use overly broad paths**
>
> Patterns like `**/*.ts` or `**/*` match thousands of files and defeat the purpose of path filtering.

**Good vs Bad Path Examples:**

| Bad (Too Broad) | Good (Targeted) | When to Use |
|-----------------|-----------------|-------------|
| `**/*.ts` | `src/gateway/**/*` | Gateway-specific patterns |
| `**/*` | `src/agents/**/*.ts` | Agent runtime patterns |
| `**/*.swift` | `apps/ios/Sources/**/*` | iOS-specific patterns |
| `**/*.ts` | `extensions/**/*` | Extension/plugin patterns |

### Step 2: Systematic MCP Discovery (If MCP-related)

**CRITICAL: Before exploring, enumerate ALL available tools:**

1. **List all tools** - Use `ListMcpResourcesTool` or ask about available tools
2. **Group by function** - Categorize into read/write/search/admin tools
3. **Check each tool's description** - Note required vs optional parameters

### Step 3: Explore & Validate (If MCP)

**For MCP-related rules, you MUST query the MCP directly:**

1. **Start with discovery tools** - List projects, check status
2. **Test each major tool** - Try real queries, note what works
3. **Find edge cases** - What happens with bad input? Missing params?
4. **Note error messages** - Document common errors and solutions
5. **Discover required config** - Region URLs, project IDs, API keys needed

### Step 4: Extract Key Patterns

From the documentation and your exploration, extract:

1. **Quick reference** - Most common operations as a table
2. **Critical gotchas** - Things that will trip people up
3. **When to use which tool** - Decision matrix
4. **Required setup** - Environment variables, IDs, etc.
5. **Common errors** - Error messages and solutions
6. **Code examples** - Real usage patterns

### Step 5: Write the Rule

**Location**: `.claude/rules/<rule-name>.md`

**Format**:
```markdown
---
paths:
  - "src/gateway/**/*"    # Required for non-global rules
  - "src/agents/**/*"     # Use array format for multiple patterns
---

# <Title>

## Quick Reference

| Task | Tool/Method | Notes |
|------|-------------|-------|
| ... | ... | ... |

## Key Concepts

Brief explanation of core concepts.

## Common Workflows

### Workflow 1: <Name>
Steps and examples...

### Workflow 2: <Name>
Steps and examples...

## Gotchas & Tips

- **Gotcha 1**: Explanation and solution
- **Gotcha 2**: Explanation and solution

## Error Reference

| Error | Cause | Solution |
|-------|-------|----------|
| ... | ... | ... |

## Environment/Setup

Required configuration...
```

### Step 6: Rule Writing Guidelines

**DO:**
- Keep under 500 lines (split if larger)
- Use tables for quick reference
- Include real examples, not hypotheticals
- Document what you discovered through exploration
- Be specific about tool names and parameters
- **Include ALL available tools in quick reference** - even ones you didn't test extensively
- Document project-specific config (org IDs, region URLs, project names)

**DON'T:**
- Include obvious/generic information
- Copy entire API docs verbatim
- Omit `paths` frontmatter for file-specific rules (causes context bloat)
- **Use broad paths like `**/*.ts`** - these match everything and clog context
- Write vague guidance ("use the right tool")
- Skip tools just because you didn't test them - at minimum list them

### Step 7: Save & Confirm

1. Create `.claude/rules/` directory if needed
2. Write the rule file
3. Summarize what was documented

$ARGUMENTS
