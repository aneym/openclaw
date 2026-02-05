import { ExternalLink, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useCallback, useState } from "react";
import { useLinearStore } from "../../stores/linear-store";
import { Button } from "../ui/button";
import { KanbanDndProvider } from "./hooks/use-kanban-dnd";
import { KanbanColumn } from "./KanbanColumn";
import { KanbanEmptyState } from "./KanbanEmptyState";
import { KanbanSetupWizard } from "./KanbanSetupWizard";

interface KanbanBoardProps {
  teamId?: string;
  projectId: string;
}

// State type ordering for columns
const STATE_TYPE_ORDER: Record<string, number> = {
  backlog: 0,
  unstarted: 1,
  started: 2,
  completed: 3,
  canceled: 4,
};

export function KanbanBoard({ teamId, projectId }: KanbanBoardProps) {
  // Track if user just connected a team (to trigger refresh)
  const [justConnected, setJustConnected] = useState(false);

  // Use correct selector pattern - select raw data, derive with useMemo
  const teams = useLinearStore((s) => s.teams);
  const issuesByTeam = useLinearStore((s) => s.issuesByTeam);
  const isLoading = useLinearStore((s) => s.isLoading);
  const error = useLinearStore((s) => s.error);
  const fetchTeams = useLinearStore((s) => s.fetchTeams);
  const fetchTeamIssues = useLinearStore((s) => s.fetchTeamIssues);

  // Derive team and issues with useMemo
  const team = useMemo(
    () => (teamId ? teams.find((t) => t.id === teamId) : undefined),
    [teams, teamId],
  );
  const issues = useMemo(
    () => (teamId ? issuesByTeam.get(teamId) || [] : []),
    [issuesByTeam, teamId],
  );

  // Fetch teams if not loaded
  useEffect(() => {
    if (teams.length === 0) {
      fetchTeams();
    }
  }, [teams.length, fetchTeams]);

  // Fetch issues for this team
  useEffect(() => {
    if (teamId) {
      fetchTeamIssues(teamId, justConnected);
      if (justConnected) setJustConnected(false);
    }
  }, [teamId, fetchTeamIssues, justConnected]);

  const handleRefresh = useCallback(() => {
    if (teamId) {
      fetchTeamIssues(teamId, true);
    }
  }, [teamId, fetchTeamIssues]);

  const handleTeamSelected = useCallback(() => {
    setJustConnected(true);
  }, []);

  // Sort states by type order, then position
  const sortedStates = useMemo(() => {
    if (!team) return [];
    return [...team.states].sort((a, b) => {
      const typeOrderA = STATE_TYPE_ORDER[a.type] ?? 99;
      const typeOrderB = STATE_TYPE_ORDER[b.type] ?? 99;
      if (typeOrderA !== typeOrderB) return typeOrderA - typeOrderB;
      return a.position - b.position;
    });
  }, [team]);

  // Group issues by state
  const issuesByState = useMemo(() => {
    const map = new Map<string, typeof issues>();
    for (const state of sortedStates) {
      map.set(state.id, []);
    }
    for (const issue of issues) {
      const stateIssues = map.get(issue.state.id) || [];
      stateIssues.push(issue);
      map.set(issue.state.id, stateIssues);
    }
    return map;
  }, [issues, sortedStates]);

  // No team configured - show setup wizard
  if (!teamId) {
    return <KanbanSetupWizard projectId={projectId} onTeamSelected={handleTeamSelected} />;
  }

  // Loading state (only on initial load)
  if (isLoading && issues.length === 0) {
    return <KanbanEmptyState type="loading" />;
  }

  // Error state
  if (error && issues.length === 0) {
    return <KanbanEmptyState type="error" error={error} onRetry={handleRefresh} />;
  }

  // No team found in store (team was configured but doesn't exist in Linear)
  if (!team) {
    return (
      <KanbanSetupWizard
        projectId={projectId}
        currentTeamId={teamId}
        onTeamSelected={handleTeamSelected}
      />
    );
  }

  // No issues
  if (issues.length === 0 && sortedStates.length > 0) {
    return <KanbanEmptyState type="no-issues" />;
  }

  return (
    <KanbanDndProvider teamId={teamId}>
      <div className="flex flex-col h-full bg-background">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-medium">{team.name}</h2>
            <span className="text-xs text-muted-foreground">
              {issues.length} issue{issues.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              disabled={isLoading}
              className="h-7 px-2"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              onClick={() => {
                window.open(`https://linear.app/team/${team.key}/board`, "_blank");
              }}
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Board */}
        <div className="flex-1 overflow-x-auto overflow-y-hidden">
          <div className="flex h-full gap-px bg-border p-2">
            {sortedStates.map((state) => (
              <KanbanColumn
                key={state.id}
                state={state}
                issues={issuesByState.get(state.id) || []}
              />
            ))}
          </div>
        </div>
      </div>
    </KanbanDndProvider>
  );
}
