---
name: merge-from-main
description: Sync feature branch with main using merge (ensures PR can merge cleanly)
argument-hint: [--dry-run]
allowed-tools: Bash(git:*), Read, Edit, Glob, Grep, AskUserQuestion
---

Merge `main` into the current feature branch with intelligent, context-aware conflict resolution. This links the branch histories so your PR can merge cleanly on GitHub.

## Why Regular Merge (Not Squash)?

**Squash merges break PRs:**

- Squash creates a single commit but doesn't link histories
- GitHub still sees "X commits behind" and conflicts
- You'd have to resolve the same conflicts again when merging the PR

**Regular merges work:**

- Creates a merge commit that links both histories
- PR can fast-forward or merge cleanly
- Conflicts resolved once, locally

**"But won't merge commits clutter my branch?"**
No - when you merge your PR using GitHub's "Squash and merge", all your feature commits (including merge commits) become ONE commit on main. The merge commits only exist on the feature branch, which is deleted after merge.

## Dry Run Mode

**If `$ARGUMENTS` contains `--dry-run` or `dry`:** Preview what would happen without making changes.

In dry-run mode:

1. Perform the merge to see conflicts/changes
2. Show detailed summary of what would be committed
3. Reset everything back to original state
4. No commits, no permanent changes

**Usage:**

- `/merge-from-main --dry-run` - Preview in current directory

## Context

### Current Directory

!`pwd`

### Current Branch

!`git branch --show-current 2>/dev/null || echo "Not in a git repo"`

### Commits on Main (since this branch diverged)

!`git fetch origin main 2>/dev/null; git log HEAD..origin/main --oneline 2>/dev/null | head -20 || echo "Could not determine commits"`

### Files Changed on Both Branches (potential conflicts)

!`comm -12 <(git diff origin/main...HEAD --name-only 2>/dev/null | sort) <(git diff HEAD...origin/main --name-only 2>/dev/null | sort) 2>/dev/null | head -20 || echo "Could not determine overlap"`

### Working Tree Status

!`git status --short 2>/dev/null || echo "Not in a git repo"`

## Instructions

### Step 0: Preflight Checks

1. **Check for dry-run mode** - If `$ARGUMENTS` contains `--dry-run` or `dry`, set DRY_RUN=true.

2. **Verify clean working tree** - If uncommitted changes exist, ask:
   - **Stash changes** - `git stash push -m "Auto-stash before sync-from-main"`
   - **Abort** - Stop and let user handle manually

3. **Verify on a feature branch** - If on `main` or `master`, ask to switch or abort.

4. **Fetch latest main**:
   ```bash
   git fetch origin main
   ```

### Step 1: Check If Sync Needed

```bash
git log HEAD..origin/main --oneline | wc -l
```

If 0 commits, output "Already up to date with main" and STOP.

### Step 2: Merge (Not Squash!)

Run a **regular merge** (this is the key change from the old squash approach):

```bash
git merge origin/main
```

**If clean (exit 0):** The merge commit is created automatically. Skip to Step 4.

**If conflicts:** Proceed to Step 3.

### Step 3: Context-Aware Conflict Resolution

**In DRY_RUN mode:** List conflicted files, summarize what needs resolution, then skip to Step 5 to reset.

For EACH conflicted file (NORMAL mode only):

#### 3a. List Conflicted Files

```bash
git diff --name-only --diff-filter=U
```

#### 3b. Analyze Commit History for Context

```bash
# Get commits that touched this file on the feature branch
git log --oneline $(git merge-base HEAD origin/main)..HEAD -- <file>

# Get commits that touched this file on main
git log --oneline $(git merge-base HEAD origin/main)..origin/main -- <file>
```

**Read commit messages** to understand intent before resolving.

#### 3c. Resolution Strategies by File Type

| File Type            | Strategy                                                    |
| -------------------- | ----------------------------------------------------------- |
| `package.json`       | Merge dependencies/scripts, prefer newer versions           |
| `pnpm-lock.yaml`     | Delete and regenerate: `rm pnpm-lock.yaml && pnpm install`  |
| Source code (.ts)    | Analyze intent, preserve both functionalities               |
| Config files         | Union of settings, prefer main for breaking changes         |
| Types/interfaces     | Merge properties, ensure no breaking changes                |
| Swift/Kotlin (apps/) | Preserve both sides' intent, prefer main for project config |

#### 3d. Semantic Resolution Principles

1. **Rename + Usage**: If main renamed, update feature's usages to new name
2. **Delete + Modify**: Usually prefer main's deletion unless feature's change is critical
3. **Both Add**: Combine both additions in logical order
4. **Refactor + Feature**: Apply feature to main's refactored structure

#### 3e. Resolve and Stage

Use Edit tool to fix conflicts, then:

```bash
git add <resolved-file>
```

After all conflicts resolved:

```bash
git commit -m "merge: resolve conflicts syncing with main

Resolved conflicts in:
- <list files>

Co-Authored-By: Claude <noreply@anthropic.com>"
```

### Step 4: Verify Build (Optional)

**Skip in DRY_RUN mode.**

```bash
pnpm lint && pnpm build
```

If verification fails, fix issues before proceeding.

### Step 5: Handle Dry Run or Complete

#### If DRY_RUN mode:

Show what would happen:

```bash
git log HEAD --oneline -1  # Show the merge commit
git diff HEAD~1 --stat     # Show what changed
```

Then reset:

```bash
git merge --abort 2>/dev/null || git reset --hard HEAD~1
git clean -fd
```

Output: "**Dry run complete.** No permanent changes made."

**STOP HERE in dry-run mode.**

#### If NORMAL mode:

The merge is already committed. Output summary:

- Number of commits merged from main
- Files with conflicts resolved (if any)
- Reminder to push when ready

### Step 6: Push (User's Choice)

Do NOT auto-push. Just remind user:

```
Merged X commits from main into <branch>

To push: git push
```

## Target Repository

$ARGUMENTS

If no repo specified, operate on the current working directory.
