#!/usr/bin/env bash
# Sync our fork with upstream openclaw/openclaw
# Usage: ./scripts/sync-upstream.sh [--dry-run]
#
# Strategy: rebase our commits on top of upstream main.
# If conflicts arise in files we own (KINETIC_OWNED_PATHS), auto-resolve ours.
# Otherwise, pause for manual resolution.

set -euo pipefail

DRY_RUN=false
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=true

# Files where our changes are intentional and should always win
KINETIC_OWNED_PATHS=(
  "packages/web-ui/"
  "scripts/agent-server.sh"
  "scripts/rename-sessions.ts"
  "scripts/web-ui.js"
  "skills/merge/"
  ".claude/"
  "AGENTS.md"
)

echo "=== Fetching upstream ==="
git fetch origin main

UPSTREAM_NEW=$(git log --oneline kinetic/main..origin/main | wc -l | tr -d ' ')
OUR_AHEAD=$(git log --oneline origin/main..kinetic/main | wc -l | tr -d ' ')

echo "  Upstream has $UPSTREAM_NEW new commit(s)"
echo "  We have $OUR_AHEAD commit(s) ahead"

if [[ "$UPSTREAM_NEW" -eq 0 ]]; then
  echo "Already up to date."
  exit 0
fi

echo ""
echo "=== Files both sides touched ==="
comm -12 \
  <(git diff --name-only origin/main...kinetic/main | sort) \
  <(git diff --name-only kinetic/main...origin/main | sort)

if $DRY_RUN; then
  echo ""
  echo "=== Dry-run merge test ==="
  git merge --no-commit --no-ff origin/main 2>&1 || true
  CONFLICTS=$(git diff --name-only --diff-filter=U 2>/dev/null)
  if [[ -n "$CONFLICTS" ]]; then
    echo "Would conflict on:"
    echo "$CONFLICTS"
  else
    echo "Clean merge — no conflicts expected."
  fi
  git merge --abort 2>/dev/null || true
  echo ""
  echo "Run without --dry-run to apply."
  exit 0
fi

echo ""
echo "=== Rebasing onto upstream ==="
if ! git rebase origin/main; then
  echo ""
  echo "Conflicts detected. Checking if they're in owned paths..."

  CONFLICTS=$(git diff --name-only --diff-filter=U)
  ALL_OWNED=true

  for file in $CONFLICTS; do
    OWNED=false
    for pattern in "${KINETIC_OWNED_PATHS[@]}"; do
      if [[ "$file" == "$pattern"* ]]; then
        OWNED=true
        break
      fi
    done
    if ! $OWNED; then
      ALL_OWNED=false
      echo "  ⚠️  MANUAL: $file (not in owned paths)"
    else
      echo "  ✅ AUTO (ours): $file"
      git checkout --ours "$file"
      git add "$file"
    fi
  done

  if $ALL_OWNED; then
    echo ""
    echo "All conflicts in owned paths — resolved with our version."
    git rebase --continue
  else
    echo ""
    echo "Some conflicts need manual resolution. Fix them, then:"
    echo "  git add <resolved-files>"
    echo "  git rebase --continue"
    exit 1
  fi
fi

echo ""
echo "=== Pushing to kinetic ==="
git push kinetic main --force-with-lease

echo ""
echo "✅ Synced. Our patches rebased on latest upstream."
