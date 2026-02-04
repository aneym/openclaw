import { create } from "zustand";
import type { LinearTeam, LinearIssue } from "../types";

interface LinearState {
  teams: LinearTeam[];
  issuesByTeam: Map<string, LinearIssue[]>;
  isLoading: boolean;
  lastFetchedAt: Map<string, number>;
  error: string | null;

  // Actions
  fetchTeams: () => Promise<void>;
  fetchTeamIssues: (teamId: string, force?: boolean) => Promise<void>;
  updateIssueState: (issueId: string, stateId: string) => Promise<void>;

  // Selectors
  getTeamIssues: (teamId: string) => LinearIssue[];
  getIssue: (issueId: string) => LinearIssue | undefined;
  getTeam: (teamId: string) => LinearTeam | undefined;
  getBlockedIssues: (teamId: string) => LinearIssue[];
  getUnblockedIssues: (teamId: string) => LinearIssue[];
}

// Cache duration: 60 seconds
const CACHE_DURATION = 60 * 1000;

export const useLinearStore = create<LinearState>()((set, get) => ({
  teams: [],
  issuesByTeam: new Map(),
  isLoading: false,
  lastFetchedAt: new Map(),
  error: null,

  fetchTeams: async () => {
    set({ isLoading: true, error: null });
    try {
      const teams = await window.api.linear.listTeams();
      set({ teams });
    } catch (err) {
      const error = err as Error;
      set({ error: error.message });
    } finally {
      set({ isLoading: false });
    }
  },

  fetchTeamIssues: async (teamId: string, force = false) => {
    const { lastFetchedAt } = get();
    const lastFetched = lastFetchedAt.get(teamId);

    // Check cache (unless forced)
    if (!force && lastFetched && Date.now() - lastFetched < CACHE_DURATION) {
      return;
    }

    set({ isLoading: true, error: null });
    try {
      const issues = await window.api.linear.getTeamIssues(teamId);

      // Update the issues map
      const newIssuesMap = new Map(get().issuesByTeam);
      newIssuesMap.set(teamId, issues);

      // Update last fetched timestamp
      const newLastFetched = new Map(get().lastFetchedAt);
      newLastFetched.set(teamId, Date.now());

      set({
        issuesByTeam: newIssuesMap,
        lastFetchedAt: newLastFetched,
      });
    } catch (err) {
      const error = err as Error;
      set({ error: error.message });
    } finally {
      set({ isLoading: false });
    }
  },

  updateIssueState: async (issueId: string, stateId: string) => {
    const { issuesByTeam, teams } = get();

    // Find the issue and its team for optimistic update
    let foundTeamId: string | null = null;
    let previousIssues: LinearIssue[] | null = null;
    let newIssuesMap = new Map(issuesByTeam);

    for (const teamId of issuesByTeam.keys()) {
      const issues = issuesByTeam.get(teamId);
      if (!issues) continue;

      const issueIndex = issues.findIndex((i) => i.id === issueId);
      if (issueIndex === -1) continue;

      foundTeamId = teamId;
      previousIssues = issues;

      // Find the new state from the team
      const team = teams.find((t) => t.id === teamId);
      const newState = team?.states.find((s) => s.id === stateId);
      if (!newState) continue;

      // Optimistic update: apply immediately
      const updatedIssues = [...issues];
      updatedIssues[issueIndex] = {
        ...updatedIssues[issueIndex],
        state: newState,
      };
      newIssuesMap.set(teamId, updatedIssues);
      break;
    }

    // Apply optimistic update
    if (foundTeamId) {
      set({ issuesByTeam: newIssuesMap, error: null });
    }

    try {
      await window.api.linear.updateIssueState(issueId, stateId);
    } catch (err) {
      // Rollback on error
      if (foundTeamId && previousIssues) {
        const rollbackMap = new Map(get().issuesByTeam);
        rollbackMap.set(foundTeamId, previousIssues);
        set({ issuesByTeam: rollbackMap });
      }

      const error = err as Error;
      set({ error: error.message });
      throw error;
    }
  },

  // Selectors
  getTeamIssues: (teamId: string) => {
    return get().issuesByTeam.get(teamId) || [];
  },

  getIssue: (issueId: string) => {
    for (const issues of get().issuesByTeam.values()) {
      const issue = issues.find((i) => i.id === issueId);
      if (issue) return issue;
    }
    return undefined;
  },

  getTeam: (teamId: string) => {
    return get().teams.find((t) => t.id === teamId);
  },

  getBlockedIssues: (teamId: string) => {
    const issues = get().issuesByTeam.get(teamId) || [];
    return issues.filter((i) => i.isBlocked);
  },

  getUnblockedIssues: (teamId: string) => {
    const issues = get().issuesByTeam.get(teamId) || [];
    return issues.filter((i) => !i.isBlocked);
  },
}));
