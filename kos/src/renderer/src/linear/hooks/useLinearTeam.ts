import { useEffect, useRef, useState } from 'react'
import { LinearClient } from '../client'
import type { LinearIssue, LinearState } from '../types'

interface UseLinearTeamOptions {
  teamId: string
  apiKey: string
  enabled?: boolean
  refetchInterval?: number // ms, default 60000 (60s)
}

interface UseLinearTeamResult {
  issues: LinearIssue[]
  states: LinearState[]
  isLoading: boolean
  isError: boolean
  error: Error | null
  refetch: () => Promise<void>
}

export function useLinearTeam(options: UseLinearTeamOptions): UseLinearTeamResult {
  const { teamId, apiKey, enabled = true, refetchInterval = 60000 } = options

  const [issues, setIssues] = useState<LinearIssue[]>([])
  const [states, setStates] = useState<LinearState[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isError, setIsError] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const clientRef = useRef<LinearClient | undefined>(undefined)
  const intervalRef = useRef<NodeJS.Timeout | undefined>(undefined)

  const fetchData = async () => {
    if (!enabled || !teamId || !apiKey) {
      setIsLoading(false)
      return
    }

    try {
      if (!clientRef.current) {
        clientRef.current = new LinearClient(apiKey)
      }

      const data = await clientRef.current.fetchTeamIssues(teamId)
      setIssues(data.issues)
      setStates(data.states)
      setIsError(false)
      setError(null)
    } catch (err) {
      setIsError(true)
      setError(err instanceof Error ? err : new Error(String(err)))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    // Initial fetch
    void fetchData()

    // Set up background refetch
    if (enabled && refetchInterval > 0) {
      intervalRef.current = setInterval(() => {
        void fetchData()
      }, refetchInterval)
    }

    // Cleanup
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId, apiKey, enabled, refetchInterval])

  return {
    issues,
    states,
    isLoading,
    isError,
    error,
    refetch: fetchData
  }
}
