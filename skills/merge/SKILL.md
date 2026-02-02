# Merge Skill

Sync local `main` with upstream `origin/main` while preserving uncommitted work.

## Usage

User says: "merge", "sync", "pull upstream", "update from origin", etc.

## Steps

1. **Save current state**: `git stash push -u -m "merge: WIP"`
2. **Fetch upstream**: `git fetch origin`
3. **Check for divergence**: `git log --oneline HEAD..origin/main | head -20`
4. **Rebase**: `git rebase origin/main`
   - If conflicts: report them, don't auto-resolve. List conflicted files.
5. **Restore work**: `git stash pop`
   - If conflicts on pop: report which files conflict. These are where upstream touched the same lines you changed locally.
6. **Report**: Show what upstream commits came in and whether anything conflicted.

## Conflict Resolution

If `git stash pop` fails with conflicts:

- Run `git diff --name-only --diff-filter=U` to list conflicted files
- For each conflicted file, show the conflict markers
- Ask the user what to do (keep ours, keep theirs, manual merge)
- After resolution: `git add <file>` and `git stash drop`

## Notes

- Always rebase (not merge) to keep history linear
- The stash preserves both tracked modifications and untracked new files (`-u`)
- If the stash pop has no conflicts, changes "just work" — hunks that upstream merged will vanish naturally
- Run `npm run lint` after to verify nothing broke

## When PRs Get Merged

When your PR is merged upstream, the next `/merge` will pull in those commits. When `git stash pop` replays your local changes, the already-merged hunks produce zero diff — they disappear. No cleanup needed.

## Quick Check

Before merging, optionally check how many commits behind:

```bash
git fetch origin && git log --oneline HEAD..origin/main | wc -l
```
