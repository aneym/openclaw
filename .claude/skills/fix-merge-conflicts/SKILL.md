---
name: fix-merge-conflicts
description: Fix all merge conflicts non-interactively and verify build
argument-hint: [base-branch]
allowed-tools: Bash(git:*), Read, Edit
---

Fix all merge conflicts on the current Git branch non-interactively and make the repo buildable and tested.

## Requirements

- Operate from the repository root. If not in a Git repo, stop and report.
- Do not ask the user for input. Choose sensible defaults and explain decisions in a brief summary.
- Prefer minimal, correct changes that preserve both sides' intent when possible.
- Use non-interactive flags for any tools you invoke.
- Do not push or tag; only commit locally.

## High-Level Plan

### 1. Detect Conflicts

Run: `git status --porcelain | cat`

Collect files with conflict markers (U statuses or files containing `<<<<<<<` / `=======` / `>>>>>>>`).

### 2. Resolve Conflicts Per File

Open each conflicting file and remove conflict markers. Merge both sides logically when feasible.

**If mutually exclusive, pick the variant that:**

- Compiles and passes type checks
- Preserves existing public APIs and behavior

**Language-aware strategy:**

- **package.json / lockfiles**: Merge keys conservatively; run install to regenerate lockfiles
- **Lock files** (pnpm-lock.yaml): Prefer regenerating via `pnpm install`
- **Generated files / build artifacts**: Prefer current branch (ours)
- **Config files**: Preserve union of safe settings; avoid deleting required fields
- **Text/markdown**: Include both unique content, deduplicate headings
- **Binary files**: Prefer current branch (ours)
- **Swift/Kotlin (apps/)**: Prefer current branch for Xcode/Gradle config; merge source files carefully

### 3. Validate

**TypeScript (primary codebase):**

- Install deps if manifests changed (`pnpm install`)
- Run `pnpm lint && pnpm build`
- Run targeted tests for affected files

**Other ecosystems:** Run their standard build/tests when available.

### 4. Finalize

- Stage all resolved files and any regenerated lockfiles
- Create a single commit with message: `chore: resolve merge conflicts`
- Output a concise summary of files touched and notable resolution choices

## Operational Guidance

- Assume the user isn't available; make best-effort decisions
- If a resolution is ambiguous and blocks build/tests, prefer the variant that compiles and green-tests
- If a file still contains conflict markers after first pass, revisit and resolve them
- For large refactors, keep consistent imports, types, and module boundaries
- Keep edits minimal and readable; avoid reformatting unrelated code

## Deliverables

- Clean working tree with all conflicts resolved
- Successful build/tests where applicable
- One local commit containing the resolutions

## Target Repository

$ARGUMENTS

If no repo specified, operate on the current working directory.
