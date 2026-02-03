import { useMemo } from 'react'
import type { LinearIssue } from '../types'

export interface DependencyGraph {
  // Check if an issue is blocked by any non-done issue
  isBlocked(issueId: string): boolean
  // Get all issues blocking this issue
  getBlockers(issueId: string): LinearIssue[]
  // Get all issues this issue blocks
  getBlocked(issueId: string): LinearIssue[]
  // Get all non-done issues that are not blocked
  getUnblockedTasks(): LinearIssue[]
  // Count of issues transitively blocked by this issue
  getDownstreamCount(issueId: string): number
  // Get the longest path through the DAG
  getCriticalPath(): LinearIssue[]
  // Topological sort of all issues
  topologicalSort(): string[]
}

function buildDependencyGraph(issues: LinearIssue[]): DependencyGraph {
  // Build adjacency lists
  const blocks = new Map<string, Set<string>>()
  const blockedBy = new Map<string, Set<string>>()
  const issuesById = new Map(issues.map((i) => [i.id, i]))

  // Helper to get or create a set
  const getOrCreate = (map: Map<string, Set<string>>, key: string): Set<string> => {
    if (!map.has(key)) {
      map.set(key, new Set())
    }
    return map.get(key)!
  }

  // Parse relations
  for (const issue of issues) {
    for (const relation of issue.relations) {
      if (relation.type === 'blocks') {
        // This issue blocks relatedIssue
        getOrCreate(blocks, issue.id).add(relation.relatedIssue.id)
        getOrCreate(blockedBy, relation.relatedIssue.id).add(issue.id)
      } else if (relation.type === 'is_blocked_by') {
        // This issue is blocked by relatedIssue
        getOrCreate(blockedBy, issue.id).add(relation.relatedIssue.id)
        getOrCreate(blocks, relation.relatedIssue.id).add(issue.id)
      }
    }
  }

  return {
    isBlocked: (issueId: string) => {
      const deps = blockedBy.get(issueId)
      if (!deps || deps.size === 0) return false

      // Blocked only if ANY blocker is not Done/Cancelled
      return Array.from(deps).some((depId) => {
        const dep = issuesById.get(depId)
        if (!dep) return false
        const stateType = dep.state.type
        return stateType !== 'completed' && stateType !== 'cancelled'
      })
    },

    getBlockers: (issueId: string) => {
      const deps = blockedBy.get(issueId)
      if (!deps) return []
      return Array.from(deps).map((id) => issuesById.get(id)).filter(Boolean) as LinearIssue[]
    },

    getBlocked: (issueId: string) => {
      const blocked = blocks.get(issueId)
      if (!blocked) return []
      return Array.from(blocked).map((id) => issuesById.get(id)).filter(Boolean) as LinearIssue[]
    },

    getUnblockedTasks: () => {
      return issues.filter((issue) => {
        const stateType = issue.state.type
        const isDone = stateType === 'completed' || stateType === 'cancelled'
        if (isDone) return false

        const deps = blockedBy.get(issue.id)
        if (!deps || deps.size === 0) return true

        // Not blocked if all blockers are done
        return !Array.from(deps).some((depId) => {
          const dep = issuesById.get(depId)
          if (!dep) return false
          const depStateType = dep.state.type
          return depStateType !== 'completed' && depStateType !== 'cancelled'
        })
      })
    },

    getDownstreamCount: (issueId: string) => {
      // BFS to count all transitively blocked issues
      const visited = new Set<string>()
      const queue = [issueId]

      while (queue.length > 0) {
        const current = queue.shift()!
        const blocked = blocks.get(current)

        if (blocked) {
          for (const blockedId of Array.from(blocked)) {
            if (!visited.has(blockedId)) {
              visited.add(blockedId)
              queue.push(blockedId)
            }
          }
        }
      }

      return visited.size
    },

    getCriticalPath: () => {
      // Find the longest path through the DAG using DFS + memoization
      const pathLengths = new Map<string, number>()
      const pathSequences = new Map<string, string[]>()

      function dfs(issueId: string): number {
        if (pathLengths.has(issueId)) {
          return pathLengths.get(issueId)!
        }

        const blocked = blocks.get(issueId)
        if (!blocked || blocked.size === 0) {
          pathLengths.set(issueId, 1)
          pathSequences.set(issueId, [issueId])
          return 1
        }

        let maxLength = 0
        let maxPath: string[] = []

        for (const blockedId of Array.from(blocked)) {
          const length = dfs(blockedId)
          if (length > maxLength) {
            maxLength = length
            maxPath = pathSequences.get(blockedId) || []
          }
        }

        const totalLength = maxLength + 1
        const totalPath = [issueId, ...maxPath]

        pathLengths.set(issueId, totalLength)
        pathSequences.set(issueId, totalPath)

        return totalLength
      }

      // Find the issue with the longest path
      let longestPath: string[] = []
      let maxPathLength = 0

      for (const issue of issues) {
        const length = dfs(issue.id)
        if (length > maxPathLength) {
          maxPathLength = length
          longestPath = pathSequences.get(issue.id) || []
        }
      }

      return longestPath.map((id) => issuesById.get(id)).filter(Boolean) as LinearIssue[]
    },

    topologicalSort: () => {
      // Kahn's algorithm for topological sorting
      const inDegree = new Map<string, number>()
      const queue: string[] = []
      const result: string[] = []

      // Initialize in-degrees
      for (const issue of issues) {
        inDegree.set(issue.id, 0)
      }

      // Count in-degrees
      for (const issue of issues) {
        const blocked = blocks.get(issue.id)
        if (blocked) {
          for (const blockedId of Array.from(blocked)) {
            inDegree.set(blockedId, (inDegree.get(blockedId) || 0) + 1)
          }
        }
      }

      // Start with issues that have no blockers
      for (const issue of issues) {
        if (inDegree.get(issue.id) === 0) {
          queue.push(issue.id)
        }
      }

      // Process queue
      while (queue.length > 0) {
        const current = queue.shift()!
        result.push(current)

        const blocked = blocks.get(current)
        if (blocked) {
          for (const blockedId of Array.from(blocked)) {
            const newDegree = (inDegree.get(blockedId) || 0) - 1
            inDegree.set(blockedId, newDegree)

            if (newDegree === 0) {
              queue.push(blockedId)
            }
          }
        }
      }

      return result
    },
  }
}

/**
 * Build a dependency graph from Linear issues and their block relations.
 * Provides queries for blocked state, unblocked tasks, critical path, etc.
 */
export function useDependencyGraph(issues: LinearIssue[]): DependencyGraph {
  return useMemo(() => buildDependencyGraph(issues), [issues])
}
