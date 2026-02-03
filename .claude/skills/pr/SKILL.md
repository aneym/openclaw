---
name: pr
description: Push and create PR with good description
argument-hint: [optional title or context]
allowed-tools: Bash(git:*), Bash(gh:*), AskUserQuestion
---

## Context

### Current Directory

!`pwd`

### Current Branch

!`git branch --show-current`

### Default Branch

!`git remote show origin 2>/dev/null | grep 'HEAD branch' | cut -d: -f2 | xargs || echo "main"`

### Commits Not on Main

!`git log main..HEAD --oneline 2>/dev/null || git log origin/main..HEAD --oneline 2>/dev/null || echo "Unable to determine commits"`

### Changed Files vs Main

!`git diff main --stat 2>/dev/null || git diff origin/main --stat 2>/dev/null || echo "Unable to determine diff"`

### Push Status

!`git status | grep -E "(ahead|behind|up to date)" | head -1 || echo "Unknown"`

### Existing PR

!`gh pr view --json number,title,url 2>/dev/null || echo "No existing PR"`

## Instructions

### Step 0: Verify Ready to PR

If on `main` branch, stop and ask user to create a feature branch first.

If there's an existing PR, ask if user wants to update it or create a new one.

### Step 1: Push Branch

If not pushed or behind remote:

```bash
git push -u origin $(git branch --show-current)
```

### Step 2: Create PR

Use `gh pr create` with:

**Title:**

- Use `$ARGUMENTS` if provided
- Otherwise, derive from branch name or first commit
- Keep it concise and descriptive

**Body:**

```markdown
## Summary

<2-4 bullet points describing what changed and why>

## Changes

<list of key changes, grouped logically>

## Test Plan

- [ ] How to test this PR

---

Generated with [Claude Code](https://claude.ai/code)
```

### Step 3: Link Issues (if applicable)

If commits reference GitHub issues (e.g., `#123`), include in description:

- `Fixes #123` - closes issue when PR merges
- `Relates to #123` - links without closing

### Step 4: Report Result

Output the PR URL so user can view it.

$ARGUMENTS
