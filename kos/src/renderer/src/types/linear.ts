export interface LinearUser {
  id: string;
  name: string;
  displayName: string;
  avatarUrl?: string;
}

export interface LinearState {
  id: string;
  name: string;
  color: string;
  position: number;
  type: "backlog" | "unstarted" | "started" | "completed" | "canceled";
}

export interface LinearLabel {
  id: string;
  name: string;
  color: string;
}

export interface LinearRelation {
  type: "blocks" | "is_blocked_by" | "related" | "duplicate";
  relatedIssue: {
    id: string;
    identifier: string;
    title: string;
    state: {
      name: string;
      type: "backlog" | "unstarted" | "started" | "completed" | "canceled";
    };
  };
}

export interface LinearIssue {
  id: string;
  identifier: string; // "KOS-7"
  title: string;
  description?: string;
  priority: number; // 0=none, 1=urgent, 2=high, 3=medium, 4=low
  state: LinearState;
  assignee?: LinearUser;
  labels: LinearLabel[];
  relations: LinearRelation[];
  // Computed fields
  isBlocked?: boolean;
  downstreamCount?: number;
}

export interface LinearTeam {
  id: string;
  name: string;
  key: string; // "KOS"
  states: LinearState[];
}

export interface LinearValidationResult {
  valid: boolean;
  user?: LinearUser;
  error?: string;
}

export interface GitHubValidationResult {
  valid: boolean;
  username?: string;
  error?: string;
}
