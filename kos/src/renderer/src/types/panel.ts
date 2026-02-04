export type PanelType =
  | "chat" // conversation (always present)
  | "coding-session" // CC/Codex terminal output
  | "terminal" // shell, logs, dev server
  | "browser" // agent's browser view
  | "preview" // iOS simulator, web preview
  | "tasks" // kanban board
  | "code" // diff view, file browser
  | "empty"; // placeholder

/** Panel types that support tabs within the panel */
export const TABBED_PANEL_TYPES: PanelType[] = ["chat", "terminal"];

/** Tab within a panel (for chat and terminal panels) */
export interface PanelTab {
  id: string;
  contentId?: string; // chatId for chat tabs, terminalId for terminal tabs
  data?: Record<string, unknown>;
}

export interface PanelState {
  id: string;
  type: PanelType;
  sessionId?: string; // linked CC session, terminal session, etc.
  data?: Record<string, unknown>; // panel-specific state
  isUserOpened: boolean; // user opened vs auto-spawned
  tabs?: PanelTab[]; // tabs within the panel (for tabbed panel types)
  activeTabId?: string; // currently active tab ID
}

// Binary tree for panel splits
export type PanelNode = PanelBranch | PanelLeaf;

export interface PanelBranch {
  type: "branch";
  direction: "horizontal" | "vertical";
  children: [PanelNode, PanelNode];
  sizes: [number, number]; // percentages
}

export interface PanelLeaf {
  type: "leaf";
  panelId: string; // references PanelState.id
}

export interface PanelLayout {
  root: PanelNode;
  panels: Map<string, PanelState>;
}

export const PANEL_TYPE_LABELS: Record<PanelType, string> = {
  chat: "Chat",
  "coding-session": "Coding Session",
  terminal: "Terminal",
  browser: "Browser",
  preview: "Preview",
  tasks: "Tasks",
  code: "Code",
  empty: "Empty",
};
