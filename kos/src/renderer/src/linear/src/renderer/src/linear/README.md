# Linear GraphQL Client

This directory contains the Linear API integration for kOS.

## Files

- `types.ts` - TypeScript interfaces for Linear issues, states, users, labels, and relations
- `client.ts` - GraphQL client for fetching team issues and updating issue states
- `index.ts` - Barrel export

## Usage

```typescript
import { LinearClient } from '@/linear'

// Get API key from workspace config
const apiKey = workspace.linearApiKey
if (!apiKey) {
  throw new Error('Linear API key not configured')
}

// Create client
const client = new LinearClient(apiKey)

// Validate API key
const isValid = await client.validateApiKey()

// Fetch team issues
const { issues, states } = await client.fetchTeamIssues(teamId)

// Update issue state (drag-and-drop)
await client.updateIssueState(issueId, newStateId)
```

## GraphQL Query

The client fetches:
- Issues (up to 250 per team)
  - id, identifier, title, description, priority
  - state (id, name, color, position, type)
  - assignee (id, name, displayName, avatarUrl)
  - labels (id, name, color)
  - relations (type, relatedIssue)
- States (all team states)
  - id, name, color, position, type

## API Key Storage

Linear API keys are stored in the workspace config:
- Key: `workspace.linearApiKey`
- Storage: localStorage via Zustand persist
- Scope: Per-workspace (different workspaces can use different Linear accounts)

## Error Handling

The client throws errors on:
- Network failures
- GraphQL errors (e.g., invalid team ID)
- Missing/invalid API key (validateApiKey returns false)

Callers should wrap in try/catch and show user-friendly error messages.

## Rate Limiting

Linear API has rate limits:
- 1000 requests/hour for personal API keys
- 3000 requests/hour for OAuth tokens

The useLinearTeam hook (to be implemented) will handle caching and background refresh (60s interval) to stay within limits.
