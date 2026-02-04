import { getLinearConfig } from "./config-storage";

// Types
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
    state: { name: string };
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

// Linear GraphQL API
const LINEAR_API = "https://api.linear.app/graphql";

// Helper for Linear GraphQL requests
async function linearQuery<T>(
  query: string,
  variables: Record<string, unknown>,
  apiKey?: string,
): Promise<T> {
  const actualKey = apiKey ?? getLinearConfig()?.apiKey;
  if (!actualKey) {
    throw new Error("Linear not connected");
  }

  const response = await fetch(LINEAR_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: actualKey,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Linear API error: ${response.status} - ${error}`);
  }

  const result = (await response.json()) as {
    data?: T;
    errors?: Array<{ message: string }>;
  };

  if (result.errors && result.errors.length > 0) {
    throw new Error(`Linear API error: ${result.errors[0].message}`);
  }

  return result.data as T;
}

// Validate an API key
export async function validateApiKey(apiKey: string): Promise<LinearValidationResult> {
  try {
    const query = `
      query {
        viewer {
          id
          name
          displayName
          avatarUrl
        }
      }
    `;

    const result = await linearQuery<{ viewer: LinearUser }>(query, {}, apiKey);

    return {
      valid: true,
      user: result.viewer,
    };
  } catch (err) {
    const error = err as Error;
    return {
      valid: false,
      error: error.message,
    };
  }
}

// List teams
export async function listTeams(apiKey?: string): Promise<LinearTeam[]> {
  const query = `
    query {
      teams {
        nodes {
          id
          name
          key
          states {
            nodes {
              id
              name
              color
              position
              type
            }
          }
        }
      }
    }
  `;

  interface TeamsResult {
    teams: {
      nodes: Array<{
        id: string;
        name: string;
        key: string;
        states: {
          nodes: Array<{
            id: string;
            name: string;
            color: string;
            position: number;
            type: string;
          }>;
        };
      }>;
    };
  }

  const result = await linearQuery<TeamsResult>(query, {}, apiKey);

  return result.teams.nodes.map((team) => ({
    id: team.id,
    name: team.name,
    key: team.key,
    states: team.states.nodes
      .map((s) => ({
        id: s.id,
        name: s.name,
        color: s.color,
        position: s.position,
        type: s.type as LinearState["type"],
      }))
      .sort((a, b) => a.position - b.position),
  }));
}

// Get issues for a team
export async function getTeamIssues(teamId: string, apiKey?: string): Promise<LinearIssue[]> {
  const query = `
    query($teamId: String!) {
      team(id: $teamId) {
        issues(first: 100) {
          nodes {
            id
            identifier
            title
            description
            priority
            state {
              id
              name
              color
              position
              type
            }
            assignee {
              id
              name
              displayName
              avatarUrl
            }
            labels {
              nodes {
                id
                name
                color
              }
            }
            relations {
              nodes {
                type
                relatedIssue {
                  id
                  identifier
                  title
                  state {
                    name
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  interface IssuesResult {
    team: {
      issues: {
        nodes: Array<{
          id: string;
          identifier: string;
          title: string;
          description?: string;
          priority: number;
          state: {
            id: string;
            name: string;
            color: string;
            position: number;
            type: string;
          };
          assignee?: {
            id: string;
            name: string;
            displayName: string;
            avatarUrl?: string;
          };
          labels: {
            nodes: Array<{
              id: string;
              name: string;
              color: string;
            }>;
          };
          relations: {
            nodes: Array<{
              type: string;
              relatedIssue: {
                id: string;
                identifier: string;
                title: string;
                state: { name: string };
              };
            }>;
          };
        }>;
      };
    };
  }

  const result = await linearQuery<IssuesResult>(query, { teamId }, apiKey);

  const issues: LinearIssue[] = result.team.issues.nodes.map((issue) => {
    const relations = issue.relations.nodes.map((r) => ({
      type: r.type as LinearRelation["type"],
      relatedIssue: {
        id: r.relatedIssue.id,
        identifier: r.relatedIssue.identifier,
        title: r.relatedIssue.title,
        state: { name: r.relatedIssue.state.name },
      },
    }));

    // Check if blocked by any unresolved issue
    const isBlocked = relations.some(
      (r) =>
        r.type === "is_blocked_by" &&
        r.relatedIssue.state.name !== "Done" &&
        r.relatedIssue.state.name !== "Canceled",
    );

    // Count downstream issues (issues this one blocks)
    const downstreamCount = relations.filter((r) => r.type === "blocks").length;

    return {
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      description: issue.description,
      priority: issue.priority,
      state: {
        id: issue.state.id,
        name: issue.state.name,
        color: issue.state.color,
        position: issue.state.position,
        type: issue.state.type as LinearState["type"],
      },
      assignee: issue.assignee
        ? {
            id: issue.assignee.id,
            name: issue.assignee.name,
            displayName: issue.assignee.displayName,
            avatarUrl: issue.assignee.avatarUrl,
          }
        : undefined,
      labels: issue.labels.nodes.map((l) => ({
        id: l.id,
        name: l.name,
        color: l.color,
      })),
      relations,
      isBlocked,
      downstreamCount,
    };
  });

  return issues;
}

// Update an issue's state
export async function updateIssueState(
  issueId: string,
  stateId: string,
  apiKey?: string,
): Promise<void> {
  const mutation = `
    mutation($issueId: String!, $stateId: String!) {
      issueUpdate(id: $issueId, input: { stateId: $stateId }) {
        success
        issue {
          id
          state {
            name
          }
        }
      }
    }
  `;

  await linearQuery(mutation, { issueId, stateId }, apiKey);
}
