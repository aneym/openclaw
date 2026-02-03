---
name: commit
description: Create a git commit with project conventions
argument-hint: [optional context]
allowed-tools: Bash(git add:*), Bash(git status:*), Bash(git diff:*), Bash(git commit:*), Bash(git log:*), Bash(git branch:*), Bash(scripts/committer:*), AskUserQuestion
---

## Context

### Current Directory

!`pwd`

### Current Branch

!`git branch --show-current`

### Recent Commits (match this style)

!`git log --oneline -10`

### Git Status

!`git status`

### Staged Changes

!`git diff --cached --stat`

### Full Diff

!`git diff HEAD`

## Instructions

### Step 1: Review Changes

Understand what was changed and why.

### Step 2: Stage Changes

If unstaged changes should be committed, run `git add` for specific files.

**Important:** Stage only files relevant to the current change. Avoid `git add -A` which may pick up unrelated modifications from other agents.

### Step 3: Write Commit Message

- **First line**: Concise, action-oriented (e.g., `CLI: add verbose flag to send`)
- **Body** (if needed): Explain what and why, not how
- Match the tone/format of recent commits in this repo
- Follow Conventional Commit style where appropriate

### Step 4: Commit

Prefer using the project's committer script:

```bash
scripts/committer "<message>" <file1> <file2> ...
```

If committer is unavailable, use `git commit` directly. Let pre-commit hooks run (NO `--no-verify`).

If hooks modify files, stage them and amend.

### Step 5: Sign Off

End message with:

```
Co-Authored-By: Claude <noreply@anthropic.com>
```

$ARGUMENTS
