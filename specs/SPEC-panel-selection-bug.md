# SPEC: Fix Non-Deterministic Panel Selection Bug

## Problem

When using the sidebar to change the active selected pane, sometimes it replaces more than one pane. This behavior should be deterministic.

## Context

The user reports that selecting something in the sidebar to change which panel is active/focused can sometimes affect multiple panels instead of just one. The behavior is inconsistent.

## Codebase Architecture

### Panel System Overview

Located in `/kos/src/renderer/src/`:

**Types** (`types/panel.ts`):

- `PanelLayout` - root container with threadId and PanelNode tree
- `PanelNode` = `PanelBranch | PanelLeaf`
- `PanelBranch` - has `direction`, `sizes`, and two children (binary tree)
- `PanelLeaf` - has `panelId`, `panelType`, optional `props`
- `PanelType` = 'chat' | 'code-editor' | 'terminal' | 'coding-session' | 'linear-board' | 'browser' | 'preview' | 'diff' | 'empty'

**Panel Store** (`stores/panel-store.ts`):

- Stores layouts per thread: `Map<threadId, PanelLayout>`
- Operations: `splitPanel`, `closePanel`, `updatePanelProps`, `resetLayout`, `setLayout`
- All operations use recursive tree traversal to find target panelId
- Default panelId for new threads: `'panel-default-chat'`

**Panel Container** (`components/panels/PanelContainer.tsx`):

- Renders the panel tree for active thread
- Uses `react-resizable-panels` library for the actual split panels
- Recursively renders `RenderNode` for each node in the tree

**Shell** (`components/layout/Shell.tsx`):

- Has `findFocusedPanelId()` helper that just returns first leaf
- TODO comment: "track actual focus state in panel store"
- Keyboard shortcuts (Cmd+W, Cmd+Shift+\) use this helper

### Key Files to Investigate

1. `stores/panel-store.ts` - panel operations and state
2. `components/panels/PanelContainer.tsx` - panel rendering
3. `components/panels/PanelContent.tsx` - panel content switching
4. `components/panels/PanelToolbar.tsx` - panel toolbar actions
5. `components/layout/Shell.tsx` - keyboard shortcuts and focus logic
6. `components/layout/Sidebar.tsx` - sidebar navigation
7. `components/nav/ProjectList.tsx` - project/thread navigation
8. `components/threads/ThreadList.tsx` - thread selection
9. `components/linear/useLinearCardClick.ts` - Linear card → thread creation

### Potential Problem Areas

1. **No actual focus tracking** - Shell.tsx uses `findFirstLeaf()` which always returns the first panel in the tree, not the actually focused one

2. **Panel ID collisions** - Default panel ID is `'panel-default-chat'` for all new threads. While layouts are keyed by threadId, there might be logic that searches across threads

3. **Recursive operations** - The `splitNode`, `removePanel`, and `updateProps` functions traverse the entire tree. Check if they're modifying nodes they shouldn't

4. **State update timing** - Zustand updates might be batching in unexpected ways

5. **Re-render cascades** - useMemo derivations from Map might be causing stale closures

## Investigation Steps

1. **Reproduce the bug first**:
   - Create a thread with multiple split panels (e.g., chat + linear-board)
   - Use sidebar to select different threads/projects
   - Note which panels change and when
   - Check if it's random or follows a pattern

2. **Add logging** to track:
   - When `setLayout` is called and with what data
   - When panel operations modify the tree
   - What `findFocusedPanelId` returns

3. **Check for race conditions**:
   - Multiple useEffect hooks triggering
   - Async operations in panel operations
   - Event handler ordering

4. **Verify panel ID uniqueness**:
   - Check if panel IDs are being reused incorrectly
   - Check if operations are matching wrong panels

## Implementation

### Phase 1: Diagnose

Add temporary logging to identify the exact flow causing multiple panels to change.

### Phase 2: Fix

Based on diagnosis, likely fixes:

1. **Add proper focus tracking** to panel-store:

```ts
interface PanelState {
  // ... existing
  focusedPanelId: Map<string, string>; // threadId -> panelId
  setFocusedPanel: (threadId: string, panelId: string) => void;
}
```

2. **Ensure deterministic panel targeting** - operations should only affect the specified panel

3. **Fix any state update race conditions**

### Phase 3: Test

- Split panels in various configurations
- Navigate between threads
- Use keyboard shortcuts
- Verify single panel changes

## Success Criteria

- Changing active pane via sidebar only affects ONE panel
- Behavior is 100% deterministic
- No regressions in existing panel functionality

## Reference

- `react-resizable-panels` docs: https://github.com/bvaughn/react-resizable-panels
- kOS panel PRD: Linear KOS-7, KOS-8
