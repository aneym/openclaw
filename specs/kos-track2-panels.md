# kOS Track 2: Panel Engine + Thread System

## Implementation Specification

**Status:** Draft  
**Depends on:** Track 1 (React scaffold, Zustand stores, gateway connection)  
**Produces:** Panel layout engine, thread management, adaptive panel triggers  

---

## 1. Architecture Overview

### 1.1 Two-Level Layout Model

kOS has two independent layout layers:

1. **Outer layout (split-tree)** — Already exists in `split-tree.ts`. A recursive binary tree that splits the window into multiple panes, each showing a different **thread**. This is the multi-thread workspace view.

2. **Inner layout (panel engine, this track)** — Within each thread's pane, a `react-resizable-panels`-based layout that arranges **panels** (chat, artifacts, agent session, terminal, etc.). Each thread has its own saved panel layout.

```
┌─────────────────────────────────────────────────────┐
│ Window (split-tree: outer layout)                   │
│ ┌─────────────────────┬───────────────────────────┐ │
│ │ Thread A (inner)    │ Thread B (inner)          │ │
│ │ ┌────────┬────────┐ │ ┌────────┬──────────────┐ │ │
│ │ │ Chat   │Artifact│ │ │ Chat   │ Agent        │ │ │
│ │ │ Panel  │Panel   │ │ │ Panel  │ Session      │ │ │
│ │ │        │        │ │ │        │ Panel        │ │ │
│ │ └────────┴────────┘ │ └────────┴──────────────┘ │ │
│ └─────────────────────┴───────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

### 1.2 Library Choice

**react-resizable-panels** (Brian Vaughn) provides:
- `<PanelGroup>` — horizontal or vertical container
- `<Panel>` — resizable child with min/max/default sizes
- `<PanelResizeHandle>` — drag handle between panels
- Nestable groups for complex layouts
- Built-in collapse/expand with `collapsible` prop
- Keyboard accessible (arrow keys on handles)
- `onLayout` callback for persisting sizes

### 1.3 File Structure

```
ui/src/
├── panels/
│   ├── types.ts              # Panel type enums, PanelDescriptor, PanelLayout interfaces
│   ├── registry.ts           # Panel type → React component mapping
│   ├── layout-engine.ts      # Layout manipulation helpers (add/remove/find panels)
│   ├── triggers.ts           # Adaptive trigger system (stream events → panel actions)
│   ├── PanelShell.tsx        # Wrapper: header bar + close button + content slot
│   ├── PanelLayoutRoot.tsx   # Top-level component: renders PanelGroup tree from layout
│   ├── panels/
│   │   ├── ChatPanel.tsx         # Always-present chat panel
│   │   ├── AgentSessionPanel.tsx # CC/Codex output stream
│   │   ├── ArtifactPanel.tsx     # Tabbed file viewer
│   │   ├── PreviewPanel.tsx      # Placeholder (Track 3)
│   │   ├── TerminalPanel.tsx     # Placeholder (Track 3)
│   │   ├── DocumentPanel.tsx     # Placeholder (future)
│   │   └── BoardPanel.tsx        # Placeholder (future)
│   └── __tests__/
│       ├── layout-engine.test.ts
│       └── triggers.test.ts
├── threads/
│   ├── types.ts              # ThreadDescriptor (extended), ThreadMeta
│   ├── store.ts              # useThreadStore — Zustand store
│   ├── storage.ts            # localStorage persistence (extends existing pattern)
│   ├── ThreadSidebar.tsx     # Thread list in sidebar
│   ├── ThreadListItem.tsx    # Single thread row
│   └── NewThreadButton.tsx   # Create new thread
└── stores/
    └── panel-layout-store.ts # usePanelLayoutStore — per-thread layout in Zustand
```

---

## 2. Panel Type System

### 2.1 Panel Types

```typescript
// panels/types.ts

/**
 * All supported panel types. Each maps to a React component via the registry.
 * Track 2 implements: chat, agent-session, artifact
 * Track 3/4 implements: preview, terminal
 * Future: document, board
 */
export type PanelType =
  | "chat"
  | "agent-session"
  | "artifact"
  | "preview"
  | "terminal"
  | "document"
  | "board";

/**
 * Describes a single panel instance within a thread's layout.
 */
export interface PanelDescriptor {
  /** Unique ID for this panel instance (e.g., "panel-1706900000000-0") */
  id: string;
  /** What kind of panel this is */
  type: PanelType;
  /** Human-readable title override (defaults to type-based label) */
  title?: string;
  /** Panel-specific config. Type-safe per panel type. */
  config: PanelConfig;
}

/**
 * Discriminated union for panel-specific configuration.
 */
export type PanelConfig =
  | ChatPanelConfig
  | AgentSessionPanelConfig
  | ArtifactPanelConfig
  | PreviewPanelConfig
  | TerminalPanelConfig
  | DocumentPanelConfig
  | BoardPanelConfig;

export interface ChatPanelConfig {
  type: "chat";
  // Chat panel has no extra config — it renders the thread's conversation
}

export interface AgentSessionPanelConfig {
  type: "agent-session";
  /** Which coding session to display (null = show all active) */
  sessionId: string | null;
  /** Auto-scroll to bottom */
  autoScroll: boolean;
}

export interface ArtifactPanelConfig {
  type: "artifact";
  /** Open tab IDs (file paths or legacy tool output IDs) */
  openTabs: string[];
  /** Currently active tab ID */
  activeTabId: string | null;
}

export interface PreviewPanelConfig {
  type: "preview";
  /** URL to preview (placeholder for Track 3 WebContentsView) */
  url: string | null;
}

export interface TerminalPanelConfig {
  type: "terminal";
  /** Terminal session ID (placeholder for Track 3) */
  terminalId: string | null;
}

export interface DocumentPanelConfig {
  type: "document";
  /** File path to edit */
  filePath: string | null;
}

export interface BoardPanelConfig {
  type: "board";
  /** Board/canvas ID (future) */
  boardId: string | null;
}
```

### 2.2 Panel ID Generation

```typescript
// panels/types.ts (continued)

let _panelSeq = 0;

export function generatePanelId(): string {
  return `panel-${Date.now()}-${_panelSeq++}`;
}
```

---

## 3. Layout Engine

### 3.1 Layout Data Model

The layout is a recursive tree of panel groups and panel slots, mirroring how `react-resizable-panels` nests `PanelGroup` > `Panel` components.

```typescript
// panels/types.ts (continued)

export type LayoutDirection = "horizontal" | "vertical";

/**
 * A leaf node in the layout tree — renders a single panel.
 */
export interface LayoutLeaf {
  kind: "leaf";
  /** References a PanelDescriptor.id in the panels map */
  panelId: string;
  /**
   * Size as percentage of parent group (0-100).
   * react-resizable-panels uses percentage-based sizes.
   */
  defaultSize: number;
  /** Minimum size percentage */
  minSize: number;
  /** Whether this panel can be collapsed to 0 */
  collapsible: boolean;
}

/**
 * A branch node — a PanelGroup containing two or more children
 * separated by resize handles.
 */
export interface LayoutGroup {
  kind: "group";
  id: string;
  direction: LayoutDirection;
  children: LayoutNode[];
}

export type LayoutNode = LayoutLeaf | LayoutGroup;

/**
 * Complete layout state for a single thread.
 */
export interface PanelLayout {
  /** Root of the layout tree */
  root: LayoutNode;
  /** All panel descriptors, keyed by panel ID */
  panels: Record<string, PanelDescriptor>;
}

/**
 * Default layout: chat (60%) on left, nothing on right initially.
 * Artifact/agent panels are added dynamically by triggers.
 */
export function createDefaultLayout(): PanelLayout {
  const chatPanelId = generatePanelId();
  return {
    root: {
      kind: "leaf",
      panelId: chatPanelId,
      defaultSize: 100,
      minSize: 30,
      collapsible: false,
    },
    panels: {
      [chatPanelId]: {
        id: chatPanelId,
        type: "chat",
        config: { type: "chat" },
      },
    },
  };
}

/**
 * Default layout with a right-side panel (used when first artifact/session appears).
 */
export function createSplitLayout(
  rightPanelType: PanelType,
  rightConfig: PanelConfig,
): PanelLayout {
  const chatPanelId = generatePanelId();
  const rightPanelId = generatePanelId();
  return {
    root: {
      kind: "group",
      id: generatePanelId(),
      direction: "horizontal",
      children: [
        {
          kind: "leaf",
          panelId: chatPanelId,
          defaultSize: 55,
          minSize: 30,
          collapsible: false,
        },
        {
          kind: "leaf",
          panelId: rightPanelId,
          defaultSize: 45,
          minSize: 20,
          collapsible: true,
        },
      ],
    },
    panels: {
      [chatPanelId]: {
        id: chatPanelId,
        type: "chat",
        config: { type: "chat" },
      },
      [rightPanelId]: {
        id: rightPanelId,
        type: rightPanelType,
        config: rightConfig,
      },
    },
  };
}
```

### 3.2 Layout Manipulation Helpers

```typescript
// panels/layout-engine.ts

import type {
  PanelLayout, LayoutNode, LayoutLeaf, LayoutGroup,
  LayoutDirection, PanelDescriptor, PanelType, PanelConfig,
} from "./types";
import { generatePanelId } from "./types";

/**
 * Find a leaf node by panel ID.
 */
export function findLeaf(node: LayoutNode, panelId: string): LayoutLeaf | null {
  if (node.kind === "leaf") {
    return node.panelId === panelId ? node : null;
  }
  for (const child of node.children) {
    const found = findLeaf(child, panelId);
    if (found) return found;
  }
  return null;
}

/**
 * Find all leaf panel IDs in tree order.
 */
export function allPanelIds(node: LayoutNode): string[] {
  if (node.kind === "leaf") return [node.panelId];
  return node.children.flatMap(allPanelIds);
}

/**
 * Find the first panel of a given type.
 */
export function findPanelByType(
  layout: PanelLayout,
  type: PanelType,
): PanelDescriptor | null {
  return Object.values(layout.panels).find((p) => p.type === type) ?? null;
}

/**
 * Find all panels of a given type.
 */
export function findPanelsByType(
  layout: PanelLayout,
  type: PanelType,
): PanelDescriptor[] {
  return Object.values(layout.panels).filter((p) => p.type === type);
}

/**
 * Add a panel to the layout. If the layout is a single leaf, wraps it in a
 * group. If it's already a group, appends to the root group (or a specified
 * target group). Rebalances sizes.
 *
 * Returns a new PanelLayout (immutable).
 */
export function addPanel(
  layout: PanelLayout,
  descriptor: PanelDescriptor,
  options?: {
    /** Direction for the new split. Default: "horizontal" */
    direction?: LayoutDirection;
    /** Size percentage for the new panel. Default: 40 */
    size?: number;
    /** Where to insert relative to existing content. Default: "after" */
    position?: "before" | "after";
    /** If set, split this specific panel instead of the root */
    splitTargetPanelId?: string;
  },
): PanelLayout {
  const direction = options?.direction ?? "horizontal";
  const newSize = options?.size ?? 40;
  const position = options?.position ?? "after";

  const newLeaf: LayoutLeaf = {
    kind: "leaf",
    panelId: descriptor.id,
    defaultSize: newSize,
    minSize: 15,
    collapsible: true,
  };

  const newPanels = { ...layout.panels, [descriptor.id]: descriptor };

  // Case 1: Layout is a single leaf — wrap in group
  if (layout.root.kind === "leaf") {
    const existingLeaf: LayoutLeaf = {
      ...layout.root,
      defaultSize: 100 - newSize,
    };
    const children = position === "before"
      ? [newLeaf, existingLeaf]
      : [existingLeaf, newLeaf];

    return {
      root: {
        kind: "group",
        id: generatePanelId(),
        direction,
        children,
      },
      panels: newPanels,
    };
  }

  // Case 2: Split a specific panel
  if (options?.splitTargetPanelId) {
    const newRoot = mapLayoutNode(layout.root, (node) => {
      if (node.kind !== "leaf" || node.panelId !== options.splitTargetPanelId) {
        return node;
      }
      const existingLeaf: LayoutLeaf = {
        ...node,
        defaultSize: 100 - newSize,
      };
      const children = position === "before"
        ? [newLeaf, existingLeaf]
        : [existingLeaf, newLeaf];
      return {
        kind: "group" as const,
        id: generatePanelId(),
        direction,
        children,
      };
    });
    return { root: newRoot, panels: newPanels };
  }

  // Case 3: Root is a group with matching direction — append/prepend
  if (layout.root.direction === direction) {
    const scaleFactor = (100 - newSize) / 100;
    const rescaled = layout.root.children.map((child) =>
      child.kind === "leaf"
        ? { ...child, defaultSize: child.defaultSize * scaleFactor }
        : child
    );
    const children = position === "before"
      ? [newLeaf, ...rescaled]
      : [...rescaled, newLeaf];

    return {
      root: { ...layout.root, children },
      panels: newPanels,
    };
  }

  // Case 4: Root is a group with different direction — wrap root in new group
  const wrappedRoot: LayoutGroup = {
    ...layout.root,
    // Root keeps 100-newSize of the new parent
  };
  const rootLeafWrapper: LayoutLeaf = {
    kind: "leaf",
    panelId: "__group__", // placeholder, we need to nest
    defaultSize: 100 - newSize,
    minSize: 20,
    collapsible: false,
  };
  // Actually, we nest the existing group as-is:
  const children = position === "before"
    ? [newLeaf, { ...layout.root, id: layout.root.id }]
    : [{ ...layout.root, id: layout.root.id }, newLeaf];

  return {
    root: {
      kind: "group",
      id: generatePanelId(),
      direction,
      children: children.map((c, i) => {
        if (c === newLeaf) return { ...newLeaf, defaultSize: newSize };
        // Wrap the existing group as a child with remaining size
        return c.kind === "group"
          ? { ...c } // groups don't have defaultSize; react-resizable-panels handles nesting
          : { ...c, defaultSize: 100 - newSize };
      }),
    },
    panels: newPanels,
  };
}

/**
 * Remove a panel from the layout. If removing leaves a group with one child,
 * the group is collapsed to that child.
 *
 * Returns null if removing the last panel (caller should reset to default layout).
 */
export function removePanel(
  layout: PanelLayout,
  panelId: string,
): PanelLayout | null {
  // Don't allow removing the chat panel
  const panel = layout.panels[panelId];
  if (panel?.type === "chat") return layout;

  const newRoot = removePanelFromNode(layout.root, panelId);
  if (newRoot === null) return null;

  const { [panelId]: _removed, ...remainingPanels } = layout.panels;

  // Redistribute sizes after removal
  const rebalanced = rebalanceSizes(newRoot);

  return { root: rebalanced, panels: remainingPanels };
}

function removePanelFromNode(node: LayoutNode, panelId: string): LayoutNode | null {
  if (node.kind === "leaf") {
    return node.panelId === panelId ? null : node;
  }

  const newChildren = node.children
    .map((child) => removePanelFromNode(child, panelId))
    .filter((child): child is LayoutNode => child !== null);

  if (newChildren.length === 0) return null;
  if (newChildren.length === 1) return newChildren[0]; // collapse single-child group

  return { ...node, children: newChildren };
}

/**
 * Rebalance sizes so children of each group sum to 100.
 */
function rebalanceSizes(node: LayoutNode): LayoutNode {
  if (node.kind === "leaf") return node;

  const rebalancedChildren = node.children.map(rebalanceSizes);
  const leafChildren = rebalancedChildren.filter(
    (c): c is LayoutLeaf => c.kind === "leaf"
  );
  const totalCurrentSize = leafChildren.reduce((sum, c) => sum + c.defaultSize, 0);

  if (totalCurrentSize === 0 || Math.abs(totalCurrentSize - 100) < 0.5) {
    return { ...node, children: rebalancedChildren };
  }

  // Scale leaf sizes proportionally to sum to 100
  const scale = 100 / totalCurrentSize;
  const scaled = rebalancedChildren.map((child) => {
    if (child.kind === "leaf") {
      return { ...child, defaultSize: child.defaultSize * scale };
    }
    return child;
  });

  return { ...node, children: scaled };
}

/**
 * Update a panel's config (immutable).
 */
export function updatePanelConfig(
  layout: PanelLayout,
  panelId: string,
  configPatch: Partial<PanelConfig>,
): PanelLayout {
  const panel = layout.panels[panelId];
  if (!panel) return layout;

  return {
    ...layout,
    panels: {
      ...layout.panels,
      [panelId]: {
        ...panel,
        config: { ...panel.config, ...configPatch } as PanelConfig,
      },
    },
  };
}

/**
 * Update sizes from react-resizable-panels onLayout callback.
 * The callback provides an array of sizes for a specific PanelGroup.
 */
export function updateGroupSizes(
  layout: PanelLayout,
  groupId: string,
  sizes: number[],
): PanelLayout {
  const newRoot = mapLayoutNode(layout.root, (node) => {
    if (node.kind !== "group" || node.id !== groupId) return node;
    const updated = node.children.map((child, i) => {
      if (child.kind === "leaf" && i < sizes.length) {
        return { ...child, defaultSize: sizes[i] };
      }
      return child;
    });
    return { ...node, children: updated };
  });
  return { ...layout, root: newRoot };
}

/**
 * Map over every node in the layout tree.
 */
function mapLayoutNode(
  node: LayoutNode,
  fn: (n: LayoutNode) => LayoutNode,
): LayoutNode {
  const replaced = fn(node);
  if (replaced !== node) return replaced;
  if (node.kind === "leaf") return node;
  const newChildren = node.children.map((child) => mapLayoutNode(child, fn));
  const changed = newChildren.some((child, i) => child !== node.children[i]);
  return changed ? { ...node, children: newChildren } : node;
}
```

### 3.3 Layout Serialization

```typescript
// panels/types.ts (continued)

/**
 * Serialized layout for localStorage persistence.
 * Compact keys to reduce storage footprint.
 */
export type SerializedLayoutLeaf = {
  k: "l";
  p: string;     // panelId
  s: number;     // defaultSize
  ms: number;    // minSize
  c: boolean;    // collapsible
};

export type SerializedLayoutGroup = {
  k: "g";
  id: string;
  d: "h" | "v";  // direction
  ch: SerializedLayoutNode[];
};

export type SerializedLayoutNode = SerializedLayoutLeaf | SerializedLayoutGroup;

export type SerializedPanelDescriptor = {
  id: string;
  t: PanelType;
  title?: string;
  cfg: PanelConfig;
};

export type SerializedPanelLayout = {
  root: SerializedLayoutNode;
  panels: SerializedPanelDescriptor[];
};

export function serializePanelLayout(layout: PanelLayout): SerializedPanelLayout {
  return {
    root: serializeNode(layout.root),
    panels: Object.values(layout.panels).map((p) => ({
      id: p.id,
      t: p.type,
      ...(p.title ? { title: p.title } : {}),
      cfg: p.config,
    })),
  };
}

export function deserializePanelLayout(data: SerializedPanelLayout): PanelLayout | null {
  try {
    const root = deserializeNode(data.root);
    const panels: Record<string, PanelDescriptor> = {};
    for (const sp of data.panels) {
      panels[sp.id] = { id: sp.id, type: sp.t, title: sp.title, config: sp.cfg };
    }
    return { root, panels };
  } catch {
    return null;
  }
}

function serializeNode(node: LayoutNode): SerializedLayoutNode {
  if (node.kind === "leaf") {
    return { k: "l", p: node.panelId, s: node.defaultSize, ms: node.minSize, c: node.collapsible };
  }
  return {
    k: "g",
    id: node.id,
    d: node.direction === "horizontal" ? "h" : "v",
    ch: node.children.map(serializeNode),
  };
}

function deserializeNode(data: SerializedLayoutNode): LayoutNode {
  if (data.k === "l") {
    return { kind: "leaf", panelId: data.p, defaultSize: data.s, minSize: data.ms, collapsible: data.c };
  }
  return {
    kind: "group",
    id: data.id,
    direction: data.d === "h" ? "horizontal" : "vertical",
    children: data.ch.map(deserializeNode),
  };
}
```

---

## 4. Panel Registry

```typescript
// panels/registry.ts

import React from "react";
import type { PanelType, PanelDescriptor } from "./types";

/**
 * Props passed to every panel component.
 */
export interface PanelComponentProps {
  /** The panel descriptor (includes type-specific config) */
  descriptor: PanelDescriptor;
  /** The thread ID this panel belongs to */
  threadId: string;
  /** Callback to update this panel's config */
  onUpdateConfig: (patch: Partial<PanelDescriptor["config"]>) => void;
  /** Callback to close/remove this panel */
  onClose: () => void;
}

type PanelComponent = React.ComponentType<PanelComponentProps>;

/**
 * Registry entry for a panel type.
 */
interface PanelRegistryEntry {
  component: PanelComponent;
  label: string;
  icon: string;
  /** If true, only one instance of this panel type per thread. */
  singleton: boolean;
  /** Default config for new instances. */
  defaultConfig: () => PanelDescriptor["config"];
}

const registry = new Map<PanelType, PanelRegistryEntry>();

/**
 * Register a panel type. Called once at app startup.
 */
export function registerPanel(type: PanelType, entry: PanelRegistryEntry): void {
  registry.set(type, entry);
}

/**
 * Get the registry entry for a panel type.
 */
export function getPanelEntry(type: PanelType): PanelRegistryEntry | undefined {
  return registry.get(type);
}

/**
 * Get all registered panel types.
 */
export function getRegisteredPanelTypes(): PanelType[] {
  return [...registry.keys()];
}

/**
 * Resolve a panel descriptor to its React component.
 */
export function resolvePanelComponent(type: PanelType): PanelComponent | null {
  return registry.get(type)?.component ?? null;
}
```

### 4.1 Registration at Startup

```typescript
// panels/register-panels.ts
// Called once in the app's entry point.

import { registerPanel } from "./registry";
import { ChatPanel } from "./panels/ChatPanel";
import { AgentSessionPanel } from "./panels/AgentSessionPanel";
import { ArtifactPanel } from "./panels/ArtifactPanel";
import { PreviewPanel } from "./panels/PreviewPanel";
import { TerminalPanel } from "./panels/TerminalPanel";

export function registerAllPanels(): void {
  registerPanel("chat", {
    component: ChatPanel,
    label: "Chat",
    icon: "💬",
    singleton: true,
    defaultConfig: () => ({ type: "chat" as const }),
  });

  registerPanel("agent-session", {
    component: AgentSessionPanel,
    label: "Agent Session",
    icon: "🧩",
    singleton: true,
    defaultConfig: () => ({
      type: "agent-session" as const,
      sessionId: null,
      autoScroll: true,
    }),
  });

  registerPanel("artifact", {
    component: ArtifactPanel,
    label: "Files",
    icon: "📄",
    singleton: true,
    defaultConfig: () => ({
      type: "artifact" as const,
      openTabs: [],
      activeTabId: null,
    }),
  });

  registerPanel("preview", {
    component: PreviewPanel,
    label: "Preview",
    icon: "👁",
    singleton: false,
    defaultConfig: () => ({
      type: "preview" as const,
      url: null,
    }),
  });

  registerPanel("terminal", {
    component: TerminalPanel,
    label: "Terminal",
    icon: "🖥️",
    singleton: false,
    defaultConfig: () => ({
      type: "terminal" as const,
      terminalId: null,
    }),
  });
}
```

---

## 5. Zustand Stores

### 5.1 Panel Layout Store

Per-thread panel layouts, persisted to localStorage.

```typescript
// stores/panel-layout-store.ts

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  PanelLayout, PanelDescriptor, PanelType, PanelConfig,
  LayoutDirection, SerializedPanelLayout,
} from "../panels/types";
import {
  createDefaultLayout, generatePanelId,
  serializePanelLayout, deserializePanelLayout,
} from "../panels/types";
import {
  addPanel, removePanel, updatePanelConfig,
  updateGroupSizes, findPanelByType,
} from "../panels/layout-engine";
import { getPanelEntry } from "../panels/registry";

interface PanelLayoutState {
  /**
   * Panel layouts keyed by thread ID.
   * Each thread has its own independent panel arrangement.
   */
  layouts: Record<string, PanelLayout>;

  /** Get layout for a thread (creates default if missing). */
  getLayout: (threadId: string) => PanelLayout;

  /** Set entire layout for a thread (used on restore). */
  setLayout: (threadId: string, layout: PanelLayout) => void;

  /** Add a panel to a thread's layout. */
  addPanel: (
    threadId: string,
    type: PanelType,
    config?: Partial<PanelConfig>,
    options?: {
      direction?: LayoutDirection;
      size?: number;
      position?: "before" | "after";
      splitTargetPanelId?: string;
    },
  ) => PanelDescriptor | null;

  /** Remove a panel from a thread's layout. */
  removePanel: (threadId: string, panelId: string) => void;

  /** Update a panel's config. */
  updatePanelConfig: (
    threadId: string,
    panelId: string,
    patch: Partial<PanelConfig>,
  ) => void;

  /** Update sizes from react-resizable-panels onLayout callback. */
  updateGroupSizes: (
    threadId: string,
    groupId: string,
    sizes: number[],
  ) => void;

  /** Delete all layout data for a thread (on thread delete). */
  deleteLayout: (threadId: string) => void;

  /**
   * Ensure a panel type exists in a thread's layout.
   * If it already exists, returns the existing descriptor.
   * If not, creates one with the given config.
   * Used by adaptive triggers.
   */
  ensurePanel: (
    threadId: string,
    type: PanelType,
    config?: Partial<PanelConfig>,
  ) => PanelDescriptor;
}

export const usePanelLayoutStore = create<PanelLayoutState>()(
  persist(
    (set, get) => ({
      layouts: {},

      getLayout: (threadId) => {
        return get().layouts[threadId] ?? createDefaultLayout();
      },

      setLayout: (threadId, layout) => {
        set((state) => ({
          layouts: { ...state.layouts, [threadId]: layout },
        }));
      },

      addPanel: (threadId, type, config, options) => {
        const entry = getPanelEntry(type);
        if (!entry) return null;

        const layout = get().getLayout(threadId);

        // Singleton check: if panel type already exists, return existing
        if (entry.singleton) {
          const existing = findPanelByType(layout, type);
          if (existing) return existing;
        }

        const descriptor: PanelDescriptor = {
          id: generatePanelId(),
          type,
          config: { ...entry.defaultConfig(), ...config } as PanelConfig,
        };

        const newLayout = addPanel(layout, descriptor, options);
        set((state) => ({
          layouts: { ...state.layouts, [threadId]: newLayout },
        }));

        return descriptor;
      },

      removePanel: (threadId, panelId) => {
        const layout = get().getLayout(threadId);
        const newLayout = removePanel(layout, panelId);
        if (newLayout === null) {
          // Removed last panel — reset to default
          set((state) => ({
            layouts: { ...state.layouts, [threadId]: createDefaultLayout() },
          }));
        } else {
          set((state) => ({
            layouts: { ...state.layouts, [threadId]: newLayout },
          }));
        }
      },

      updatePanelConfig: (threadId, panelId, patch) => {
        const layout = get().getLayout(threadId);
        const newLayout = updatePanelConfig(layout, panelId, patch);
        set((state) => ({
          layouts: { ...state.layouts, [threadId]: newLayout },
        }));
      },

      updateGroupSizes: (threadId, groupId, sizes) => {
        const layout = get().getLayout(threadId);
        const newLayout = updateGroupSizes(layout, groupId, sizes);
        set((state) => ({
          layouts: { ...state.layouts, [threadId]: newLayout },
        }));
      },

      deleteLayout: (threadId) => {
        set((state) => {
          const { [threadId]: _, ...rest } = state.layouts;
          return { layouts: rest };
        });
      },

      ensurePanel: (threadId, type, config) => {
        const layout = get().getLayout(threadId);
        const existing = findPanelByType(layout, type);
        if (existing) return existing;

        const descriptor = get().addPanel(threadId, type, config);
        // addPanel returns null only if registry entry missing
        // which shouldn't happen for known types
        return descriptor!;
      },
    }),
    {
      name: "kos.panel-layouts.v1",
      storage: createJSONStorage(() => localStorage, {
        // Custom serialization for the layouts map
        reviver: (_key, value) => value,
        replacer: (_key, value) => value,
      }),
      partialize: (state) => ({
        // Only persist layouts, not methods
        layouts: Object.fromEntries(
          Object.entries(state.layouts).map(([threadId, layout]) => [
            threadId,
            serializePanelLayout(layout),
          ]),
        ),
      }),
      merge: (persisted, current) => {
        const stored = persisted as { layouts?: Record<string, SerializedPanelLayout> };
        const restoredLayouts: Record<string, PanelLayout> = {};
        if (stored?.layouts) {
          for (const [threadId, serialized] of Object.entries(stored.layouts)) {
            const layout = deserializePanelLayout(serialized);
            if (layout) restoredLayouts[threadId] = layout;
          }
        }
        return { ...current, layouts: restoredLayouts };
      },
    },
  ),
);
```

### 5.2 Thread Store

Extends existing `ThreadDescriptor` and `ThreadState` patterns with Zustand.

```typescript
// threads/types.ts

/**
 * Extended ThreadDescriptor for kOS.
 * Adds project scoping and task references on top of the existing shape.
 */
export interface KosThreadDescriptor {
  /** Unique thread ID (UUID) */
  id: string;
  /** Gateway session key (e.g., "agent:main:webchat:thread:<id>") */
  sessionKey: string;
  /** Display label (user-editable or auto-titled) */
  label: string;
  /** Creation timestamp (ms) */
  createdAt: number;
  /** Last activity timestamp (ms) — updated on send/receive */
  lastActivityAt: number;
  /** Parent session key for session hierarchy */
  parentSessionKey: string;
  /** Optional: project grouping ID */
  projectId?: string;
  /** Optional: reference to a task/issue (e.g., "GH-123") */
  taskRef?: string;
  /** Whether auto-title has been applied from gateway */
  autoTitled: boolean;
  /** Archived (hidden from active list, still accessible) */
  archived: boolean;
  /** Pinned to top of list */
  pinned: boolean;
}

/**
 * Minimal thread metadata for the sidebar list.
 * Derived from the full ThreadState for rendering efficiency.
 */
export interface ThreadListMeta {
  id: string;
  label: string;
  lastActivityAt: number;
  unreadCount: number;
  hasNewMessages: boolean;
  isActive: boolean; // has a running agent turn
  archived: boolean;
  pinned: boolean;
  projectId?: string;
}
```

```typescript
// threads/store.ts

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { KosThreadDescriptor, ThreadListMeta } from "./types";
import { generateUUID } from "../ui/uuid";

interface ThreadStoreState {
  /** All thread descriptors, keyed by thread ID. */
  threads: Record<string, KosThreadDescriptor>;

  /** Currently active thread ID. */
  activeThreadId: string | null;

  /** Order of thread IDs for sidebar display (sorted by lastActivityAt desc). */
  threadOrder: string[];

  // ── Actions ──

  /** Create a new thread and make it active. Returns the new descriptor. */
  createThread: (opts?: {
    label?: string;
    parentSessionKey?: string;
    projectId?: string;
  }) => KosThreadDescriptor;

  /** Switch to a different thread. Triggers layout save/restore. */
  switchThread: (threadId: string) => void;

  /** Rename a thread. */
  renameThread: (threadId: string, label: string) => void;

  /** Apply auto-title from gateway (only if not manually renamed). */
  applyAutoTitle: (threadId: string, title: string) => void;

  /** Archive a thread (hide from active list). */
  archiveThread: (threadId: string) => void;

  /** Unarchive a thread. */
  unarchiveThread: (threadId: string) => void;

  /** Delete a thread permanently. */
  deleteThread: (threadId: string) => void;

  /** Toggle pin status. */
  togglePin: (threadId: string) => void;

  /** Update lastActivityAt for a thread. */
  touchThread: (threadId: string) => void;

  /** Update unread/activity indicators. */
  markThreadRead: (threadId: string) => void;
  incrementUnread: (threadId: string) => void;

  /** Get ordered list metadata for sidebar rendering. */
  getThreadList: (opts?: { includeArchived?: boolean }) => ThreadListMeta[];

  /** Recompute threadOrder from thread timestamps. */
  _recomputeOrder: () => void;
}

export const useThreadStore = create<ThreadStoreState>()(
  persist(
    (set, get) => ({
      threads: {},
      activeThreadId: null,
      threadOrder: [],

      createThread: (opts) => {
        const id = generateUUID();
        const now = Date.now();
        const parentSessionKey = opts?.parentSessionKey ?? "agent:main:webchat";
        const descriptor: KosThreadDescriptor = {
          id,
          sessionKey: `${parentSessionKey}:thread:${id}`,
          label: opts?.label ?? "New thread",
          createdAt: now,
          lastActivityAt: now,
          parentSessionKey,
          projectId: opts?.projectId,
          autoTitled: false,
          archived: false,
          pinned: false,
        };

        set((state) => ({
          threads: { ...state.threads, [id]: descriptor },
          activeThreadId: id,
          threadOrder: [id, ...state.threadOrder],
        }));

        return descriptor;
      },

      switchThread: (threadId) => {
        const thread = get().threads[threadId];
        if (!thread) return;
        set({ activeThreadId: threadId });
      },

      renameThread: (threadId, label) => {
        set((state) => {
          const thread = state.threads[threadId];
          if (!thread) return state;
          return {
            threads: {
              ...state.threads,
              [threadId]: { ...thread, label, autoTitled: false },
            },
          };
        });
      },

      applyAutoTitle: (threadId, title) => {
        set((state) => {
          const thread = state.threads[threadId];
          if (!thread || !thread.autoTitled === false) {
            // Only auto-title if the user hasn't manually renamed
            // and the current label is still default
            if (thread && thread.label === "New thread") {
              return {
                threads: {
                  ...state.threads,
                  [threadId]: { ...thread, label: title, autoTitled: true },
                },
              };
            }
          }
          return state;
        });
      },

      archiveThread: (threadId) => {
        set((state) => {
          const thread = state.threads[threadId];
          if (!thread) return state;
          const updates: Partial<ThreadStoreState> = {
            threads: {
              ...state.threads,
              [threadId]: { ...thread, archived: true },
            },
          };
          // If archiving the active thread, switch to the next one
          if (state.activeThreadId === threadId) {
            const nextId = state.threadOrder.find(
              (id) => id !== threadId && !state.threads[id]?.archived,
            );
            updates.activeThreadId = nextId ?? null;
          }
          return updates;
        });
      },

      unarchiveThread: (threadId) => {
        set((state) => {
          const thread = state.threads[threadId];
          if (!thread) return state;
          return {
            threads: {
              ...state.threads,
              [threadId]: { ...thread, archived: false },
            },
          };
        });
      },

      deleteThread: (threadId) => {
        set((state) => {
          const { [threadId]: _, ...remaining } = state.threads;
          const newOrder = state.threadOrder.filter((id) => id !== threadId);
          const updates: Partial<ThreadStoreState> = {
            threads: remaining,
            threadOrder: newOrder,
          };
          if (state.activeThreadId === threadId) {
            updates.activeThreadId = newOrder[0] ?? null;
          }
          return updates;
        });
        // Also clean up layout data
        // (imported at usage site to avoid circular deps)
      },

      togglePin: (threadId) => {
        set((state) => {
          const thread = state.threads[threadId];
          if (!thread) return state;
          return {
            threads: {
              ...state.threads,
              [threadId]: { ...thread, pinned: !thread.pinned },
            },
          };
        });
        get()._recomputeOrder();
      },

      touchThread: (threadId) => {
        set((state) => {
          const thread = state.threads[threadId];
          if (!thread) return state;
          return {
            threads: {
              ...state.threads,
              [threadId]: { ...thread, lastActivityAt: Date.now() },
            },
          };
        });
        get()._recomputeOrder();
      },

      markThreadRead: (threadId) => {
        // Managed in the chat state layer, not here.
        // This is a pass-through for the sidebar indicator.
      },

      incrementUnread: (threadId) => {
        // Same — managed in chat state layer.
      },

      getThreadList: (opts) => {
        const state = get();
        const includeArchived = opts?.includeArchived ?? false;
        return state.threadOrder
          .map((id) => state.threads[id])
          .filter((t): t is KosThreadDescriptor => {
            if (!t) return false;
            if (!includeArchived && t.archived) return false;
            return true;
          })
          .map((t) => ({
            id: t.id,
            label: t.label,
            lastActivityAt: t.lastActivityAt,
            unreadCount: 0, // Populated from chat state
            hasNewMessages: false,
            isActive: false, // Populated from chat state (chatSending/chatRunId)
            archived: t.archived,
            pinned: t.pinned,
            projectId: t.projectId,
          }));
      },

      _recomputeOrder: () => {
        set((state) => {
          const entries = Object.values(state.threads);
          entries.sort((a, b) => {
            // Pinned first
            if (a.pinned && !b.pinned) return -1;
            if (!a.pinned && b.pinned) return 1;
            // Then by lastActivityAt desc
            return b.lastActivityAt - a.lastActivityAt;
          });
          return { threadOrder: entries.map((e) => e.id) };
        });
      },
    }),
    {
      name: "kos.threads.v1",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        threads: state.threads,
        activeThreadId: state.activeThreadId,
        threadOrder: state.threadOrder,
      }),
    },
  ),
);
```

---

## 6. React Components

### 6.1 PanelLayoutRoot

The top-level component that recursively renders the layout tree as react-resizable-panels components.

```tsx
// panels/PanelLayoutRoot.tsx

import React, { useCallback } from "react";
import { PanelGroup, Panel, PanelResizeHandle } from "react-resizable-panels";
import type { LayoutNode, LayoutLeaf, LayoutGroup, PanelLayout } from "./types";
import { resolvePanelComponent } from "./registry";
import { PanelShell } from "./PanelShell";
import { usePanelLayoutStore } from "../stores/panel-layout-store";

interface PanelLayoutRootProps {
  threadId: string;
  layout: PanelLayout;
}

export function PanelLayoutRoot({ threadId, layout }: PanelLayoutRootProps) {
  return (
    <div className="panel-layout-root h-full w-full">
      <LayoutNodeRenderer
        node={layout.root}
        layout={layout}
        threadId={threadId}
      />
    </div>
  );
}

interface LayoutNodeRendererProps {
  node: LayoutNode;
  layout: PanelLayout;
  threadId: string;
}

function LayoutNodeRenderer({ node, layout, threadId }: LayoutNodeRendererProps) {
  if (node.kind === "leaf") {
    return (
      <LeafRenderer
        leaf={node}
        layout={layout}
        threadId={threadId}
      />
    );
  }
  return (
    <GroupRenderer
      group={node}
      layout={layout}
      threadId={threadId}
    />
  );
}

interface GroupRendererProps {
  group: LayoutGroup;
  layout: PanelLayout;
  threadId: string;
}

function GroupRenderer({ group, layout, threadId }: GroupRendererProps) {
  const updateGroupSizes = usePanelLayoutStore((s) => s.updateGroupSizes);

  const handleLayout = useCallback(
    (sizes: number[]) => {
      updateGroupSizes(threadId, group.id, sizes);
    },
    [threadId, group.id, updateGroupSizes],
  );

  return (
    <PanelGroup
      direction={group.direction}
      id={group.id}
      onLayout={handleLayout}
    >
      {group.children.map((child, index) => (
        <React.Fragment key={child.kind === "leaf" ? child.panelId : (child as LayoutGroup).id}>
          {index > 0 && (
            <PanelResizeHandle className="panel-resize-handle" />
          )}
          {child.kind === "leaf" ? (
            <Panel
              id={child.panelId}
              defaultSize={child.defaultSize}
              minSize={child.minSize}
              collapsible={child.collapsible}
              order={index}
            >
              <LeafRenderer
                leaf={child}
                layout={layout}
                threadId={threadId}
              />
            </Panel>
          ) : (
            <Panel
              id={(child as LayoutGroup).id}
              order={index}
              minSize={10}
            >
              <GroupRenderer
                group={child as LayoutGroup}
                layout={layout}
                threadId={threadId}
              />
            </Panel>
          )}
        </React.Fragment>
      ))}
    </PanelGroup>
  );
}

interface LeafRendererProps {
  leaf: LayoutLeaf;
  layout: PanelLayout;
  threadId: string;
}

function LeafRenderer({ leaf, layout, threadId }: LeafRendererProps) {
  const descriptor = layout.panels[leaf.panelId];
  const removePanel = usePanelLayoutStore((s) => s.removePanel);
  const updateConfig = usePanelLayoutStore((s) => s.updatePanelConfig);

  if (!descriptor) {
    return <div className="panel-error">Panel not found: {leaf.panelId}</div>;
  }

  const Component = resolvePanelComponent(descriptor.type);
  if (!Component) {
    return <div className="panel-error">Unknown panel type: {descriptor.type}</div>;
  }

  const handleClose = useCallback(() => {
    removePanel(threadId, leaf.panelId);
  }, [threadId, leaf.panelId, removePanel]);

  const handleUpdateConfig = useCallback(
    (patch: Partial<typeof descriptor.config>) => {
      updateConfig(threadId, leaf.panelId, patch);
    },
    [threadId, leaf.panelId, updateConfig],
  );

  return (
    <PanelShell
      descriptor={descriptor}
      onClose={descriptor.type === "chat" ? undefined : handleClose}
    >
      <Component
        descriptor={descriptor}
        threadId={threadId}
        onUpdateConfig={handleUpdateConfig}
        onClose={handleClose}
      />
    </PanelShell>
  );
}
```

### 6.2 PanelShell

Wrapper providing consistent header bar for all panels.

```tsx
// panels/PanelShell.tsx

import React from "react";
import { getPanelEntry } from "./registry";
import type { PanelDescriptor } from "./types";
import { X } from "lucide-react";

interface PanelShellProps {
  descriptor: PanelDescriptor;
  onClose?: () => void;
  children: React.ReactNode;
}

export function PanelShell({ descriptor, onClose, children }: PanelShellProps) {
  const entry = getPanelEntry(descriptor.type);
  const label = descriptor.title ?? entry?.label ?? descriptor.type;
  const icon = entry?.icon ?? "📦";

  return (
    <div className="panel-shell flex flex-col h-full">
      <div className="panel-shell-header flex items-center gap-2 px-3 py-1.5 border-b border-border bg-muted/30 shrink-0">
        <span className="panel-shell-icon text-sm">{icon}</span>
        <span className="panel-shell-label text-xs font-medium text-muted-foreground truncate flex-1">
          {label}
        </span>
        {onClose && (
          <button
            onClick={onClose}
            className="panel-shell-close p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title={`Close ${label}`}
          >
            <X size={14} />
          </button>
        )}
      </div>
      <div className="panel-shell-content flex-1 overflow-hidden">
        {children}
      </div>
    </div>
  );
}
```

### 6.3 PanelResizeHandle Styling

```tsx
// panels/resize-handle.css (or Tailwind classes)

/*
 * The resize handle between panels.
 * react-resizable-panels uses data-resize-handle-state attribute:
 * "hover", "drag", or "inactive"
 */

.panel-resize-handle {
  width: 4px;
  background: transparent;
  transition: background-color 150ms ease;
  position: relative;
}

.panel-resize-handle::after {
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  left: -2px;
  right: -2px;
  /* Wider hit area for easier grabbing */
}

.panel-resize-handle[data-resize-handle-state="hover"],
.panel-resize-handle[data-resize-handle-state="drag"] {
  background: hsl(var(--primary) / 0.5);
}

/* Vertical handles (inside horizontal groups) */
[data-panel-group-direction="vertical"] > .panel-resize-handle {
  width: auto;
  height: 4px;
}

[data-panel-group-direction="vertical"] > .panel-resize-handle::after {
  top: -2px;
  bottom: -2px;
  left: 0;
  right: 0;
}
```

---

## 7. Adaptive Panel Triggers

### 7.1 Trigger System

Panels are automatically created/updated based on gateway events. The trigger system listens to the tool stream and agent events, then dispatches panel actions.

```typescript
// panels/triggers.ts

import type { AgentEventPayload } from "../ui/app-tool-stream";
import type { PanelType, ArtifactPanelConfig } from "./types";
import { usePanelLayoutStore } from "../stores/panel-layout-store";

/**
 * Trigger definition: maps a condition to a panel action.
 */
interface PanelTrigger {
  /** Human-readable name for debugging */
  name: string;
  /** Test whether this trigger fires for the given event */
  test: (event: TriggerEvent) => boolean;
  /** What to do when the trigger fires */
  action: TriggerAction;
}

/**
 * Events that can fire triggers.
 */
export type TriggerEvent =
  | { kind: "tool-stream"; payload: AgentEventPayload }
  | { kind: "artifact-created"; filePath: string; fileName: string }
  | { kind: "coding-session-started"; sessionId: string; title: string }
  | { kind: "coding-session-ended"; sessionId: string }
  | { kind: "user-message-sent" }
  | { kind: "agent-response-received" };

/**
 * Actions a trigger can dispatch.
 */
export type TriggerAction =
  | { kind: "ensure-panel"; panelType: PanelType; config?: Record<string, unknown> }
  | { kind: "add-artifact-tab"; filePath: string; fileName: string }
  | { kind: "remove-panel"; panelType: PanelType }
  | { kind: "update-panel-config"; panelType: PanelType; patch: Record<string, unknown> };

/**
 * Built-in triggers. More can be added by plugins/extensions.
 */
const builtinTriggers: PanelTrigger[] = [
  {
    name: "coding-session-started → add agent-session panel",
    test: (event) => event.kind === "coding-session-started",
    action: { kind: "ensure-panel", panelType: "agent-session" },
  },
  {
    name: "artifact-created → add artifact panel + tab",
    test: (event) => event.kind === "artifact-created",
    action: { kind: "ensure-panel", panelType: "artifact" },
  },
  {
    name: "tool-stream file write → open artifact tab",
    test: (event) => {
      if (event.kind !== "tool-stream") return false;
      const data = event.payload.data ?? {};
      const name = typeof data.name === "string" ? data.name : "";
      const phase = typeof data.phase === "string" ? data.phase : "";
      return (name === "Write" || name === "Edit") && phase === "result";
    },
    action: { kind: "ensure-panel", panelType: "artifact" },
  },
];

/**
 * Process a trigger event against all registered triggers.
 * Returns an array of actions to execute.
 */
export function evaluateTriggers(event: TriggerEvent): TriggerAction[] {
  const actions: TriggerAction[] = [];
  for (const trigger of builtinTriggers) {
    if (trigger.test(event)) {
      actions.push(trigger.action);
    }
  }
  return actions;
}

/**
 * Execute trigger actions against the panel layout store.
 * Called from the event processing layer.
 */
export function executeTriggerActions(
  threadId: string,
  event: TriggerEvent,
): void {
  const actions = evaluateTriggers(event);
  const store = usePanelLayoutStore.getState();

  for (const action of actions) {
    switch (action.kind) {
      case "ensure-panel": {
        store.ensurePanel(threadId, action.panelType, action.config);
        break;
      }
      case "add-artifact-tab": {
        // Ensure artifact panel exists
        const descriptor = store.ensurePanel(threadId, "artifact");
        // Add tab to its config
        const config = descriptor.config as ArtifactPanelConfig;
        if (!config.openTabs.includes(action.filePath)) {
          store.updatePanelConfig(threadId, descriptor.id, {
            openTabs: [...config.openTabs, action.filePath],
            activeTabId: action.filePath,
          });
        }
        break;
      }
      case "remove-panel": {
        const layout = store.getLayout(threadId);
        const panel = Object.values(layout.panels).find(
          (p) => p.type === action.panelType,
        );
        if (panel) {
          store.removePanel(threadId, panel.id);
        }
        break;
      }
      case "update-panel-config": {
        const layout = store.getLayout(threadId);
        const panel = Object.values(layout.panels).find(
          (p) => p.type === action.panelType,
        );
        if (panel) {
          store.updatePanelConfig(threadId, panel.id, action.patch);
        }
        break;
      }
    }
  }
}
```

### 7.2 Event Integration Points

The trigger system hooks into the existing event flow. These are the integration points where `executeTriggerActions` should be called:

```typescript
// Integration point 1: Tool stream events (in the gateway event handler)
//
// When handleAgentEvent processes a tool event, also fire triggers:
//
//   if (data.name === "Write" && phase === "result") {
//     executeTriggerActions(threadId, {
//       kind: "artifact-created",
//       filePath: data.args?.file_path ?? data.args?.path ?? "",
//       fileName: extractFileName(data.args?.file_path ?? ""),
//     });
//   }

// Integration point 2: Coding session events (from CodingPanel's session tracking)
//
// When a coding_session_started event arrives:
//
//   executeTriggerActions(threadId, {
//     kind: "coding-session-started",
//     sessionId: session.id,
//     title: session.title,
//   });

// Integration point 3: The agent event SSE handler
//
// In the gateway SSE stream processor, after dispatching to the tool stream:
//
//   if (payload.stream === "tool") {
//     executeTriggerActions(activeThreadId, {
//       kind: "tool-stream",
//       payload,
//     });
//   }
```

### 7.3 Trigger → File Path Extraction

```typescript
// panels/triggers.ts (continued)

/**
 * Extract file path from tool stream event data.
 * Handles both Write and Edit tool patterns.
 */
export function extractFilePath(data: Record<string, unknown>): string | null {
  const args = data.args as Record<string, unknown> | undefined;
  if (!args) return null;
  const path =
    typeof args.file_path === "string" ? args.file_path :
    typeof args.path === "string" ? args.path :
    null;
  return path;
}

/**
 * Extract just the filename from a full path.
 */
export function extractFileName(filePath: string): string {
  const parts = filePath.split("/");
  return parts[parts.length - 1] ?? filePath;
}
```

---

## 8. Thread Switching & Layout Persistence

### 8.1 Thread Switch Flow

When switching threads, the current layout is automatically saved (Zustand persist handles this), and the target thread's layout is restored.

```typescript
// threads/switch-thread.ts

import { useThreadStore } from "./store";
import { usePanelLayoutStore } from "../stores/panel-layout-store";

/**
 * Complete thread switch procedure:
 *
 * 1. Save current thread's chat state (scroll position, draft, etc.)
 * 2. Update activeThreadId in thread store
 * 3. Panel layout store automatically has the target thread's layout
 *    (or creates a default if none exists)
 * 4. Restore target thread's chat state
 * 5. Mark target thread as read
 *
 * Steps 1 and 4 are handled by the chat state layer (not in this track).
 * Steps 2-3 are handled by the stores.
 */
export function switchThread(targetThreadId: string): void {
  const threadStore = useThreadStore.getState();
  const panelLayoutStore = usePanelLayoutStore.getState();

  // Current layout auto-persists via Zustand persist middleware.
  // No explicit save needed.

  // Switch active thread
  threadStore.switchThread(targetThreadId);

  // Ensure target thread has a layout (creates default if missing)
  const layout = panelLayoutStore.getLayout(targetThreadId);
  // Layout is now available for PanelLayoutRoot to render.
  // React will re-render because activeThreadId changed.
}
```

### 8.2 Thread Deletion Cleanup

```typescript
// threads/delete-thread.ts

import { useThreadStore } from "./store";
import { usePanelLayoutStore } from "../stores/panel-layout-store";

export function deleteThread(threadId: string): void {
  // Delete layout data first
  usePanelLayoutStore.getState().deleteLayout(threadId);
  // Then delete the thread
  useThreadStore.getState().deleteThread(threadId);
}
```

---

## 9. Panel Component Interfaces

### 9.1 ChatPanel (Track 2: Full Implementation)

```tsx
// panels/panels/ChatPanel.tsx

import React from "react";
import type { PanelComponentProps } from "../registry";

/**
 * The primary chat panel. Always present in every thread.
 * Renders the conversation, input box, queue, and tool stream.
 *
 * This wraps the existing chat rendering logic from app-render.ts
 * and app-chat.ts, adapted to work within the panel system.
 */
export function ChatPanel({ descriptor, threadId }: PanelComponentProps) {
  // Reads from:
  //   - Thread's chatMessages, chatStream, chatSending, chatRunId
  //   - Thread's chatToolMessages (tool stream sidebar)
  //   - Thread's chatQueue (queued messages)
  //   - Thread's chatMessage (draft input)
  //
  // Provides:
  //   - Message list with markdown rendering
  //   - Chat input with slash commands, attachments
  //   - Queue display
  //   - Scroll management (auto-scroll, "new messages" indicator)
  //   - Compaction status toast

  return (
    <div className="chat-panel flex flex-col h-full">
      {/* Message list */}
      <div className="chat-messages flex-1 overflow-y-auto">
        {/* Rendered from thread's chatMessages + chatToolMessages */}
      </div>

      {/* Chat input */}
      <div className="chat-input border-t border-border">
        {/* Text area, send button, attachment button, model selector */}
      </div>
    </div>
  );
}
```

### 9.2 AgentSessionPanel (Track 2: Full Implementation)

```tsx
// panels/panels/AgentSessionPanel.tsx

import React from "react";
import type { PanelComponentProps } from "../registry";
import type { AgentSessionPanelConfig } from "../types";

/**
 * Displays coding session status and event timeline.
 * Adapts the existing coding-panel.ts (Lit) to React.
 *
 * Features:
 * - Session cards with phase indicators (exploring/planning/building/testing)
 * - Expandable event timeline per session
 * - Kill/dismiss buttons
 * - Pending question input (when CC asks a question)
 * - Terminal view (full event stream for a single session)
 */
export function AgentSessionPanel({
  descriptor,
  threadId,
  onUpdateConfig,
}: PanelComponentProps) {
  const config = descriptor.config as AgentSessionPanelConfig;

  // Reads from:
  //   - Coding session list (active + history)
  //   - Per-session stream events (parsed from tool stream)
  //   - Per-session phase detection
  //   - Pending questions map
  //
  // Uses the same parseStreamEvents / detectCurrentPhase / summarizeEvent
  // logic from coding-panel.ts, extracted into a shared module.

  return (
    <div className="agent-session-panel flex flex-col h-full overflow-y-auto">
      {/* Active sessions */}
      {/* Session cards with expand/collapse */}
      {/* History sessions */}
      {/* Empty state */}
    </div>
  );
}
```

### 9.3 ArtifactPanel (Track 2: Full Implementation)

```tsx
// panels/panels/ArtifactPanel.tsx

import React from "react";
import type { PanelComponentProps } from "../registry";
import type { ArtifactPanelConfig } from "../types";

/**
 * Tabbed file viewer. Adapts artifact-panel.ts (Lit) to React.
 *
 * Features:
 * - Tab bar with open files
 * - Markdown rendering (rendered or raw toggle)
 * - Code syntax highlighting (via markdown code fences)
 * - File editing (markdown-editor for .md files)
 * - Auto-save with debounce
 * - Refresh from disk
 * - Copy to clipboard
 * - Updated indicator (flash when file changes)
 */
export function ArtifactPanel({
  descriptor,
  threadId,
  onUpdateConfig,
  onClose,
}: PanelComponentProps) {
  const config = descriptor.config as ArtifactPanelConfig;

  // Reads from:
  //   - ArtifactTab[] state (loading, content, error per tab)
  //   - File system via gateway API (read file contents)
  //
  // Tab state management:
  //   - config.openTabs: list of file paths
  //   - config.activeTabId: currently selected tab
  //   - Tab content is fetched on demand, not stored in layout config
  //   - Separate ephemeral state (in component or a tab-content store)
  //     for loading/content/error per tab

  return (
    <div className="artifact-panel flex flex-col h-full">
      {/* Tab bar */}
      <div className="artifact-tabs border-b border-border">
        {/* Tab buttons + close buttons */}
      </div>

      {/* Tab content */}
      <div className="artifact-content flex-1 overflow-y-auto">
        {/* Rendered markdown / code / loading / error / empty */}
      </div>

      {/* Footer: refresh, copy, file path, save status */}
      <div className="artifact-footer border-t border-border">
        {/* Action buttons */}
      </div>
    </div>
  );
}
```

### 9.4 PreviewPanel (Track 2: Interface Only)

```tsx
// panels/panels/PreviewPanel.tsx

import React from "react";
import type { PanelComponentProps } from "../registry";

/**
 * Placeholder for embedded web preview.
 * Track 3 will implement this with Electron's WebContentsView.
 */
export function PreviewPanel({ descriptor }: PanelComponentProps) {
  return (
    <div className="preview-panel flex items-center justify-center h-full text-muted-foreground">
      <div className="text-center">
        <span className="text-3xl">👁</span>
        <p className="mt-2 text-sm">Preview panel</p>
        <p className="text-xs">Coming in Track 3</p>
      </div>
    </div>
  );
}
```

### 9.5 TerminalPanel (Track 2: Interface Only)

```tsx
// panels/panels/TerminalPanel.tsx

import React from "react";
import type { PanelComponentProps } from "../registry";

/**
 * Placeholder for embedded terminal.
 * Track 3 will implement this with xterm.js + node-pty via Electron IPC.
 */
export function TerminalPanel({ descriptor }: PanelComponentProps) {
  return (
    <div className="terminal-panel flex items-center justify-center h-full text-muted-foreground bg-black/5">
      <div className="text-center">
        <span className="text-3xl">🖥️</span>
        <p className="mt-2 text-sm">Terminal panel</p>
        <p className="text-xs">Coming in Track 3</p>
      </div>
    </div>
  );
}
```

---

## 10. Thread Sidebar

### 10.1 ThreadSidebar Component

```tsx
// threads/ThreadSidebar.tsx

import React from "react";
import { useThreadStore } from "./store";
import { ThreadListItem } from "./ThreadListItem";
import { NewThreadButton } from "./NewThreadButton";

interface ThreadSidebarProps {
  collapsed?: boolean;
}

export function ThreadSidebar({ collapsed }: ThreadSidebarProps) {
  const threadList = useThreadStore((s) => s.getThreadList());
  const activeThreadId = useThreadStore((s) => s.activeThreadId);
  const switchThread = useThreadStore((s) => s.switchThread);

  // Separate pinned from unpinned
  const pinned = threadList.filter((t) => t.pinned);
  const unpinned = threadList.filter((t) => !t.pinned);

  if (collapsed) {
    // Collapsed: show only icons/avatars
    return (
      <div className="thread-sidebar-collapsed w-12 border-r border-border">
        <NewThreadButton collapsed />
        {threadList.map((t) => (
          <ThreadListItem
            key={t.id}
            meta={t}
            active={t.id === activeThreadId}
            collapsed
            onClick={() => switchThread(t.id)}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="thread-sidebar w-64 border-r border-border flex flex-col h-full">
      <div className="thread-sidebar-header px-3 py-2 border-b border-border">
        <NewThreadButton />
      </div>
      <div className="thread-sidebar-list flex-1 overflow-y-auto">
        {pinned.length > 0 && (
          <div className="thread-group">
            <div className="thread-group-label px-3 py-1 text-xs text-muted-foreground font-medium">
              Pinned
            </div>
            {pinned.map((t) => (
              <ThreadListItem
                key={t.id}
                meta={t}
                active={t.id === activeThreadId}
                onClick={() => switchThread(t.id)}
              />
            ))}
          </div>
        )}
        <div className="thread-group">
          {pinned.length > 0 && (
            <div className="thread-group-label px-3 py-1 text-xs text-muted-foreground font-medium">
              Recent
            </div>
          )}
          {unpinned.map((t) => (
            <ThreadListItem
              key={t.id}
              meta={t}
              active={t.id === activeThreadId}
              onClick={() => switchThread(t.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
```

### 10.2 ThreadListItem

```tsx
// threads/ThreadListItem.tsx

import React from "react";
import type { ThreadListMeta } from "./types";

interface ThreadListItemProps {
  meta: ThreadListMeta;
  active: boolean;
  collapsed?: boolean;
  onClick: () => void;
}

export function ThreadListItem({ meta, active, collapsed, onClick }: ThreadListItemProps) {
  if (collapsed) {
    return (
      <button
        onClick={onClick}
        className={`thread-item-collapsed w-full p-2 flex justify-center ${active ? "bg-accent" : "hover:bg-muted"}`}
        title={meta.label}
      >
        <span className="text-sm">
          {meta.unreadCount > 0 ? "🔵" : "💬"}
        </span>
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      className={`thread-item w-full px-3 py-2 flex items-center gap-2 text-left transition-colors ${
        active ? "bg-accent text-accent-foreground" : "hover:bg-muted"
      }`}
    >
      {meta.isActive && (
        <span className="thread-item-activity w-2 h-2 rounded-full bg-green-500 shrink-0 animate-pulse" />
      )}
      <span className="thread-item-label text-sm truncate flex-1">
        {meta.label}
      </span>
      {meta.unreadCount > 0 && (
        <span className="thread-item-unread bg-primary text-primary-foreground text-xs rounded-full px-1.5 py-0.5 min-w-[1.25rem] text-center">
          {meta.unreadCount > 99 ? "99+" : meta.unreadCount}
        </span>
      )}
      <span className="thread-item-time text-xs text-muted-foreground">
        {formatRelativeTime(meta.lastActivityAt)}
      </span>
    </button>
  );
}

function formatRelativeTime(ts: number): string {
  const now = Date.now();
  const diff = now - ts;
  if (diff < 60_000) return "now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
```

---

## 11. Auto-Title from Gateway

When a thread sends its first message, the gateway can derive a title. The thread system listens for this.

```typescript
// threads/auto-title.ts

import { useThreadStore } from "./store";

/**
 * Called when the gateway returns a derived title for a session.
 * The gateway sends this as part of the agent response metadata.
 *
 * Integration point: In the SSE event handler, when receiving a
 * "session_meta" or "derivedTitle" field in the response:
 *
 *   if (event.derivedTitle) {
 *     handleAutoTitle(sessionKey, event.derivedTitle);
 *   }
 */
export function handleAutoTitle(sessionKey: string, title: string): void {
  const state = useThreadStore.getState();
  // Find thread by sessionKey
  const thread = Object.values(state.threads).find(
    (t) => t.sessionKey === sessionKey,
  );
  if (thread) {
    state.applyAutoTitle(thread.id, title);
  }
}
```

---

## 12. Keyboard Shortcuts

```typescript
// panels/keyboard-shortcuts.ts

/**
 * Panel-related keyboard shortcuts.
 * Integrated into the existing keyboard-shortcuts.ts system.
 */

export const PANEL_SHORTCUTS = {
  /** Toggle artifact panel */
  "Cmd+Shift+A": "toggle-artifact-panel",
  /** Toggle agent session panel */
  "Cmd+Shift+S": "toggle-agent-session-panel",
  /** Close focused panel (not chat) */
  "Cmd+W": "close-panel",
  /** New thread */
  "Cmd+N": "new-thread",
  /** Next thread */
  "Cmd+]": "next-thread",
  /** Previous thread */
  "Cmd+[": "prev-thread",
  /** Focus chat input */
  "Cmd+L": "focus-chat-input",
} as const;
```

---

## 13. Implementation Order

### Phase 1: Core Types + Store (1-2 days)
1. `panels/types.ts` — All TypeScript interfaces, PanelType enum, serialization
2. `panels/layout-engine.ts` — Layout manipulation helpers + tests
3. `stores/panel-layout-store.ts` — Zustand store with persist
4. `panels/registry.ts` — Panel registration system

### Phase 2: React Components (2-3 days)
5. `panels/PanelShell.tsx` — Panel wrapper with header
6. `panels/PanelLayoutRoot.tsx` — Recursive react-resizable-panels renderer
7. `panels/panels/ChatPanel.tsx` — Port existing chat rendering
8. `panels/panels/ArtifactPanel.tsx` — Port existing artifact panel from Lit
9. `panels/panels/AgentSessionPanel.tsx` — Port existing coding panel from Lit
10. `panels/panels/PreviewPanel.tsx` — Placeholder
11. `panels/panels/TerminalPanel.tsx` — Placeholder
12. `panels/register-panels.ts` — Registration at startup

### Phase 3: Thread Management (1-2 days)
13. `threads/types.ts` — Extended ThreadDescriptor
14. `threads/store.ts` — Thread Zustand store
15. `threads/ThreadSidebar.tsx` — Thread list
16. `threads/ThreadListItem.tsx` — Thread row
17. `threads/NewThreadButton.tsx` — Create thread
18. `threads/auto-title.ts` — Gateway auto-title integration

### Phase 4: Triggers + Integration (1 day)
19. `panels/triggers.ts` — Adaptive trigger system
20. Wire triggers into existing event handlers
21. Wire thread switching to layout save/restore
22. Keyboard shortcuts

### Phase 5: Polish (1 day)
23. Resize handle styling
24. Panel animations (collapse/expand)
25. Thread sidebar collapse state
26. Edge cases: thread delete with multiple panes, layout corruption recovery

---

## 14. Migration from Existing Code

### 14.1 What Gets Replaced

| Existing File | Replacement | Notes |
|---|---|---|
| `pane-state.ts` (ArtifactTab) | `panels/types.ts` (ArtifactPanelConfig) | Tab state moves into panel config |
| `pane-state.ts` (PaneState) | Removed | Panel-level state handled by each panel component |
| `views/artifact-panel.ts` | `panels/panels/ArtifactPanel.tsx` | Lit → React |
| `views/coding-panel.ts` | `panels/panels/AgentSessionPanel.tsx` | Lit → React (shared logic extracted) |
| `thread-state.ts` (ThreadDescriptor) | `threads/types.ts` (KosThreadDescriptor) | Extended with projectId, taskRef, etc. |
| `thread-storage.ts` | `threads/store.ts` (Zustand persist) | localStorage key: `kos.threads.v1` |
| `app-view-state.ts` (artifact* fields) | `stores/panel-layout-store.ts` | Artifact state moves into panel system |

### 14.2 What Gets Preserved

- `split-tree.ts` — Kept as-is for outer multi-thread pane layout
- `app-tool-stream.ts` — Kept as-is; triggers consume its events
- `thread-state.ts` (ThreadState, chat fields) — Kept for chat state management
- `coding-panel.ts` (parseStreamEvents, detectCurrentPhase) — Extract to shared module, reuse in AgentSessionPanel

### 14.3 localStorage Keys

| Key | Contents |
|---|---|
| `kos.panel-layouts.v1` | `Record<threadId, SerializedPanelLayout>` |
| `kos.threads.v1` | `{ threads, activeThreadId, threadOrder }` |
| `openclaw.control.threads.v1` | Legacy — migrate on first load, then delete |

---

## 15. Edge Cases

### 15.1 Layout Corruption Recovery
If a stored layout fails deserialization, fall back to `createDefaultLayout()`. Log a warning but don't crash.

### 15.2 Thread Delete with Active Panels
When deleting a thread:
1. Close any open panels (cleanup timers, subscriptions)
2. Delete layout from panel-layout-store
3. Delete thread from thread-store
4. Switch to next available thread (or create new one)

### 15.3 Panel Type Not Registered
If a stored layout references a panel type that isn't registered (e.g., future type loaded in older version), render a fallback "Unknown panel" component. Don't crash.

### 15.4 react-resizable-panels Size Constraints
- `minSize` on all panels to prevent invisible panels (minimum 10% for groups, 15% for leaves)
- `maxSize` not used — panels can take up remaining space
- `collapsible` panels can go to 0% but have a collapse/expand toggle
- If all panels in a group are collapsed, the group still renders (handles visible)

### 15.5 Empty Thread List
When no threads exist (first launch), auto-create a default thread titled "New thread".

---

## 16. Testing Strategy

### Unit Tests
- `layout-engine.test.ts` — addPanel, removePanel, rebalanceSizes, findPanelByType
- `triggers.test.ts` — evaluateTriggers with various event types
- `thread-store.test.ts` — CRUD operations, ordering, auto-title

### Integration Tests
- Thread switch → layout restore
- Trigger fires → panel appears
- Panel close → layout rebalances
- localStorage persistence round-trip

### Manual Testing Checklist
- [ ] Create thread, see default layout (chat only)
- [ ] Send message with file write → artifact panel appears
- [ ] Start coding session → agent session panel appears
- [ ] Resize panels → sizes persist after refresh
- [ ] Switch threads → different layouts restore
- [ ] Delete thread → layout cleaned up
- [ ] Keyboard shortcuts work
- [ ] Collapse/expand panels
- [ ] Nested split (horizontal group inside vertical group)
