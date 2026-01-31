# SPEC: Prevent Duplicate Threads in Split Panes

## Problem
When in split-pane mode, clicking a session in the sidebar calls `setThreadInPane(focusedPaneId, sessionKey)` without checking if that session is already visible in another pane. This allows the same thread to appear in two panes simultaneously.

## Current Behavior
- User has panes A and B open with different threads
- User focuses pane B, clicks a session in the sidebar that's already open in pane A
- Both panes now show the same thread → duplicate

## Desired Behavior
- If the selected thread is already open in another pane, **focus that existing pane** instead of duplicating
- This applies to ALL code paths that could assign a thread to a pane:
  - `setThreadInPane()` in `app.ts` (main entry point, line ~901)
  - Sidebar `onSelect` callback in `app-render.ts` (line ~279)
  - `startNewSession` in `app-render.ts` (line ~122) — this creates new threads so it's safe, but verify
  - `splitPane()` in `app.ts` (line ~675) — creates new threads, should be safe
  - `swapPanes()` — swaps, can't create dupes
  - `moveLeafBeside()` — moves, can't create dupes

## Implementation Plan

### 1. Guard in `setThreadInPane()` (`app.ts`, line ~901)

Add a check at the top of `setThreadInPane`:
- Call `allLeaves(this.splitLayout.root)` to get all current leaves
- If any leaf (other than the target pane) already has this `threadId`, call `this.focusPane(existingLeaf.id)` and return early
- This is the single choke point — all sidebar selections flow through here

```typescript
setThreadInPane(paneId: string, threadId: string) {
  if (!this.splitLayout) return;

  // Prevent duplicate: if thread is already in another pane, focus it instead
  const existingLeaf = allLeaves(this.splitLayout.root).find(
    (l) => l.threadId === threadId && l.id !== paneId
  );
  if (existingLeaf) {
    this.focusPane(existingLeaf.id);
    return;
  }

  // ... rest of existing code
}
```

### 2. Unit tests (`split-tree.test.ts`)

Create `/Users/aneyman/bot/openclaw/ui/src/ui/split-tree.test.ts` with tests for:

- `createLeaf` creates a leaf with correct threadId
- `splitLeaf` produces a branch with two children
- `removeLeaf` prunes correctly
- `findLeaf` finds by paneId
- `allLeaves` collects all leaves
- `allThreadIds` deduplicates thread IDs
- `setLeafThread` replaces threadId on correct leaf
- `swapLeafThreads` swaps two leaves' threadIds
- `buildBalancedTree` builds correct structure
- `serializeLayout` / `deserializeLayout` round-trips correctly

**Important:** These are pure function tests. Use `import { describe, it, expect } from 'vitest'`. No browser/DOM needed. The existing vitest config uses browser mode, so you may need to check if pure tests run fine under it — they should since vitest browser mode still supports non-DOM tests.

### 3. Verify build
Run `npx vite build` to confirm no compile errors.
Run `npx vitest run src/ui/split-tree.test.ts` to run the new tests.

## Files to Change
- `src/ui/app.ts` — add duplicate guard in `setThreadInPane()` (~3 lines)
- `src/ui/split-tree.test.ts` — new file, unit tests

## Key Context

### `setThreadInPane` (app.ts ~901)
```typescript
setThreadInPane(paneId: string, threadId: string) {
  if (!this.splitLayout) return;

  // Clean up the old thread if it was an empty auto-created one
  const oldLeaf = findLeaf(this.splitLayout.root, paneId);
  if (oldLeaf && oldLeaf.threadId !== threadId) {
    const oldMapId = this.sessionKeyToThreadId.get(oldLeaf.threadId);
    if (oldMapId && oldMapId !== 'main-thread') {
      const oldThread = this.threads.get(oldMapId);
      if (oldThread && oldThread.chatMessages.length === 0) {
        this.threads.delete(oldMapId);
        this.sessionKeyToThreadId.delete(oldLeaf.threadId);
        saveThreadDescriptors(this.getThreadDescriptors());
        this.threads = new Map(this.threads);
      }
    }
  }

  // Ensure a ThreadState exists for the new session key
  if (!this.sessionKeyToThreadId.has(threadId)) {
    const desc: ThreadDescriptor = {
      id: `pane-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      sessionKey: threadId,
      label: '',
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      parentSessionKey: threadId.split(':thread:')[0] || threadId,
    };
    const newThread = createThreadState(desc);
    this.threads.set(desc.id, newThread);
    this.sessionKeyToThreadId.set(desc.sessionKey, desc.id);
  }

  const newRoot = setLeafThread(this.splitLayout.root, paneId, threadId);
  this.splitLayout = { ...this.splitLayout, root: newRoot };
  this.syncPaneStatesFromLayout();
  this.persistSplitLayout();
  this.syncUrlWithPanes(false);
}
```

### `focusPane` (app.ts ~860)
This is the method to call when we find the thread is already in another pane.

### `allLeaves` (split-tree.ts)
```typescript
export function allLeaves(root: SplitNode): SplitLeaf[] {
  if (root.kind === 'leaf') return [root]
  return [...allLeaves(root.first), ...allLeaves(root.second)]
}
```

### Imports already in app.ts
`allLeaves` is already imported in app.ts (line 47), so no new imports needed.

## Testing Plan
1. Build succeeds: `npx vite build`
2. Unit tests pass: `npx vitest run src/ui/split-tree.test.ts`
3. Manual QA: open split panes, try to open same thread in both — should focus existing pane instead

## Completion
When done, run:
```
openclaw gateway wake --text "Done: duplicate thread prevention in split panes — guard added to setThreadInPane, split-tree unit tests created" --mode now
```
