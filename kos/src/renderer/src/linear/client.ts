import type { LinearIssue, LinearState, LinearTeamData } from './types'

const LINEAR_API = 'https://api.linear.app/graphql'

interface LinearGraphQLResponse<T> {
  data?: T
  errors?: Array<{ message: string; path?: string[] }>
}

interface TeamResponse {
  team: {
    issues: {
      nodes: Array<{
        id: string
        identifier: string
        title: string
        description?: string
        priority: number
        state: {
          id: string
          name: string
          color: string
          position: number
          type: string
        }
        assignee?: {
          id: string
          name: string
          displayName: string
          avatarUrl?: string
        }
        labels: {
          nodes: Array<{
            id: string
            name: string
            color: string
          }>
        }
        relations: {
          nodes: Array<{
            type: string
            relatedIssue: {
              id: string
              identifier: string
              title: string
              state: {
                name: string
              }
            }
          }>
        }
      }>
    }
    states: {
      nodes: Array<{
        id: string
        name: string
        color: string
        position: number
        type: string
      }>
    }
  }
}

export class LinearClient {
  private apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  private async query<T>(query: string): Promise<T> {
    const response = await fetch(LINEAR_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: this.apiKey
      },
      body: JSON.stringify({ query })
    })

    if (!response.ok) {
      throw new Error(`Linear API error: ${response.status} ${response.statusText}`)
    }

    const json = (await response.json()) as LinearGraphQLResponse<T>

    if (json.errors && json.errors.length > 0) {
      throw new Error(`Linear GraphQL error: ${json.errors[0].message}`)
    }

    if (!json.data) {
      throw new Error('Linear API returned no data')
    }

    return json.data
  }

  async fetchTeamIssues(teamId: string): Promise<LinearTeamData> {
    const query = `{
      team(id: "${teamId}") {
        issues(first: 250) {
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
    }`

    const response = await this.query<TeamResponse>(query)

    // Transform to our internal types
    const issues: LinearIssue[] = response.team.issues.nodes.map((node) => ({
      id: node.id,
      identifier: node.identifier,
      title: node.title,
      description: node.description,
      priority: node.priority,
      state: {
        id: node.state.id,
        name: node.state.name,
        color: node.state.color,
        position: node.state.position,
        type: node.state.type as LinearState['type']
      },
      assignee: node.assignee
        ? {
            id: node.assignee.id,
            name: node.assignee.name,
            displayName: node.assignee.displayName,
            avatarUrl: node.assignee.avatarUrl
          }
        : undefined,
      labels: node.labels.nodes,
      relations: node.relations.nodes
        .filter((rel) => ['blocks', 'is_blocked_by', 'related', 'duplicate'].includes(rel.type))
        .map((rel) => ({
          type: rel.type as 'blocks' | 'is_blocked_by' | 'related' | 'duplicate',
          relatedIssue: rel.relatedIssue
        }))
    }))

    const states: LinearState[] = response.team.states.nodes.map((node) => ({
      id: node.id,
      name: node.name,
      color: node.color,
      position: node.position,
      type: node.type as LinearState['type']
    }))

    return { issues, states }
  }

  async updateIssueState(issueId: string, stateId: string): Promise<void> {
    const mutation = `
      mutation {
        issueUpdate(
          id: "${issueId}",
          input: { stateId: "${stateId}" }
        ) {
          success
          issue {
            id
            state {
              id
              name
            }
          }
        }
      }
    `

    await this.query(mutation)
  }

  async validateApiKey(): Promise<boolean> {
    try {
      const query = `{
        viewer {
          id
          name
        }
      }`
      await this.query(query)
      return true
    } catch {
      return false
    }
  }
}
