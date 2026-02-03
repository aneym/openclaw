import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Tab } from "../types";

interface TabState {
  tabsByWorkspace: Record<string, Tab[]>;
  activeTabIdByWorkspace: Record<string, string>;
  activeThreadIdByTab: Record<string, string | null>;
  selectedProjectIdByTab: Record<string, string | null>;

  openHomeTab: (workspaceId: string) => void;
  openProjectTab: (workspaceId: string, projectId: string) => void;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  setActiveThread: (tabId: string, threadId: string | null) => void;
  setSelectedProject: (tabId: string, projectId: string | null) => void;
}

const createTabId = () => `tab-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const createHomeTab = (workspaceId: string, now: number): Tab => ({
  id: `home-${workspaceId}`,
  workspaceId,
  type: "home",
  title: "Home",
  isPinned: true,
  lastActiveAt: now,
});

const createProjectTab = (workspaceId: string, projectId: string, now: number): Tab => ({
  id: createTabId(),
  workspaceId,
  type: "project",
  title: projectId,
  projectId,
  isPinned: false,
  lastActiveAt: now,
});

const ensureActiveThreadEntry = (
  activeThreadIdByTab: Record<string, string | null>,
  tabId: string,
) => {
  if (Object.prototype.hasOwnProperty.call(activeThreadIdByTab, tabId)) {
    return activeThreadIdByTab;
  }
  return { ...activeThreadIdByTab, [tabId]: null };
};

const ensureHomeTab = (tabs: Tab[], workspaceId: string, now: number) => {
  let homeTab: Tab | undefined;
  const projectTabs: Tab[] = [];

  for (const tab of tabs) {
    if (tab.type === "home") {
      if (!homeTab) {
        homeTab = tab;
      }
      continue;
    }
    projectTabs.push(tab);
  }

  if (!homeTab) {
    homeTab = createHomeTab(workspaceId, now);
    return { tabs: [homeTab, ...projectTabs], homeTab, created: true };
  }

  return { tabs: [homeTab, ...projectTabs], homeTab, created: false };
};

const findTabLocation = (tabsByWorkspace: Record<string, Tab[]>, tabId: string) => {
  for (const [workspaceId, tabs] of Object.entries(tabsByWorkspace)) {
    const index = tabs.findIndex((tab) => tab.id === tabId);
    if (index !== -1) {
      return { workspaceId, tabs, tab: tabs[index], index };
    }
  }
  return null;
};

export const useTabStore = create<TabState>()(
  persist(
    (set) => ({
      tabsByWorkspace: {},
      activeTabIdByWorkspace: {},
      activeThreadIdByTab: {},
      selectedProjectIdByTab: {},

      openHomeTab: (workspaceId: string) => {
        set((state) => {
          const now = Date.now();
          const existingTabs = state.tabsByWorkspace[workspaceId] ?? [];
          const { tabs, homeTab } = ensureHomeTab(existingTabs, workspaceId, now);

          const updatedTabs = tabs.map((tab) =>
            tab.id === homeTab.id ? { ...tab, lastActiveAt: now } : tab,
          );

          return {
            tabsByWorkspace: { ...state.tabsByWorkspace, [workspaceId]: updatedTabs },
            activeTabIdByWorkspace: { ...state.activeTabIdByWorkspace, [workspaceId]: homeTab.id },
            activeThreadIdByTab: ensureActiveThreadEntry(state.activeThreadIdByTab, homeTab.id),
            selectedProjectIdByTab: { ...state.selectedProjectIdByTab, [homeTab.id]: null },
          };
        });
      },

      openProjectTab: (workspaceId: string, projectId: string) => {
        set((state) => {
          const now = Date.now();
          const existingTabs = state.tabsByWorkspace[workspaceId] ?? [];
          const { tabs, homeTab } = ensureHomeTab(existingTabs, workspaceId, now);
          const existingProjectTab = tabs.find(
            (tab) => tab.type === "project" && tab.projectId === projectId,
          );

          let activeThreadIdByTab = ensureActiveThreadEntry(state.activeThreadIdByTab, homeTab.id);

          if (existingProjectTab) {
            activeThreadIdByTab = ensureActiveThreadEntry(
              activeThreadIdByTab,
              existingProjectTab.id,
            );

            return {
              tabsByWorkspace: {
                ...state.tabsByWorkspace,
                [workspaceId]: tabs.map((tab) =>
                  tab.id === existingProjectTab.id ? { ...tab, lastActiveAt: now } : tab,
                ),
              },
              activeTabIdByWorkspace: {
                ...state.activeTabIdByWorkspace,
                [workspaceId]: existingProjectTab.id,
              },
              activeThreadIdByTab,
              selectedProjectIdByTab: {
                ...state.selectedProjectIdByTab,
                [homeTab.id]: null,
                [existingProjectTab.id]: projectId,
              },
            };
          }

          const newTab = createProjectTab(workspaceId, projectId, now);

          return {
            tabsByWorkspace: {
              ...state.tabsByWorkspace,
              [workspaceId]: [...tabs, newTab],
            },
            activeTabIdByWorkspace: {
              ...state.activeTabIdByWorkspace,
              [workspaceId]: newTab.id,
            },
            activeThreadIdByTab: {
              ...activeThreadIdByTab,
              [newTab.id]: null,
            },
            selectedProjectIdByTab: {
              ...state.selectedProjectIdByTab,
              [homeTab.id]: null,
              [newTab.id]: projectId,
            },
          };
        });
      },

      closeTab: (tabId: string) => {
        set((state) => {
          const location = findTabLocation(state.tabsByWorkspace, tabId);
          if (!location || location.tab.isPinned || location.tab.type === "home") {
            return state;
          }

          const now = Date.now();
          const remainingTabs = location.tabs.filter((tab) => tab.id !== tabId);
          let updatedTabs = remainingTabs;

          const activeTabIdByWorkspace = { ...state.activeTabIdByWorkspace };
          if (activeTabIdByWorkspace[location.workspaceId] === tabId) {
            const nextTab =
              remainingTabs.find((tab) => tab.type === "home") ?? remainingTabs[0] ?? null;

            if (nextTab) {
              activeTabIdByWorkspace[location.workspaceId] = nextTab.id;
              updatedTabs = remainingTabs.map((tab) =>
                tab.id === nextTab.id ? { ...tab, lastActiveAt: now } : tab,
              );
            } else {
              delete activeTabIdByWorkspace[location.workspaceId];
            }
          }

          const activeThreadIdByTab = { ...state.activeThreadIdByTab };
          delete activeThreadIdByTab[tabId];

          const selectedProjectIdByTab = { ...state.selectedProjectIdByTab };
          delete selectedProjectIdByTab[tabId];

          return {
            tabsByWorkspace: {
              ...state.tabsByWorkspace,
              [location.workspaceId]: updatedTabs,
            },
            activeTabIdByWorkspace,
            activeThreadIdByTab,
            selectedProjectIdByTab,
          };
        });
      },

      setActiveTab: (tabId: string) => {
        set((state) => {
          const location = findTabLocation(state.tabsByWorkspace, tabId);
          if (!location) {
            return state;
          }

          const now = Date.now();
          const updatedTabs = location.tabs.map((tab) =>
            tab.id === tabId ? { ...tab, lastActiveAt: now } : tab,
          );

          const selectedProjectIdByTab =
            location.tab.type === "project"
              ? {
                  ...state.selectedProjectIdByTab,
                  [tabId]: location.tab.projectId ?? state.selectedProjectIdByTab[tabId] ?? null,
                }
              : { ...state.selectedProjectIdByTab, [tabId]: null };

          return {
            tabsByWorkspace: {
              ...state.tabsByWorkspace,
              [location.workspaceId]: updatedTabs,
            },
            activeTabIdByWorkspace: {
              ...state.activeTabIdByWorkspace,
              [location.workspaceId]: tabId,
            },
            activeThreadIdByTab: ensureActiveThreadEntry(state.activeThreadIdByTab, tabId),
            selectedProjectIdByTab,
          };
        });
      },

      setActiveThread: (tabId: string, threadId: string | null) => {
        set((state) => ({
          activeThreadIdByTab: { ...state.activeThreadIdByTab, [tabId]: threadId },
        }));
      },

      setSelectedProject: (tabId: string, projectId: string | null) => {
        set((state) => ({
          selectedProjectIdByTab: { ...state.selectedProjectIdByTab, [tabId]: projectId },
        }));
      },
    }),
    {
      name: "kos-tabs",
    },
  ),
);
