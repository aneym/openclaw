import { useCallback } from 'react'
import { useGatewayStore } from '../../stores/gateway-store'
import { useThreadStore } from '../../stores/thread-store'
import { usePanelStore } from '../../stores/panel-store'
import type { LinearIssue } from '@/linear/types'
import type { Thread } from '../../types'

function generateThreadId(): string {
  return 'thread-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9)
}

function generateSessionKey(): string {
  return 'kos-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9)
}

/**
 * Hook to handle clicking on a Linear card.
 * - Finds existing thread for the Linear issue
 * - If found, activates it
 * - If not found, creates a new thread with the issue context
 */
export function useLinearCardClick() {
  const request = useGatewayStore((s) => s.request)
  const connected = useGatewayStore((s) => s.connected)
  const addThread = useThreadStore((s) => s.addThread)
  const setActiveThread = useThreadStore((s) => s.setActiveThread)
  const getThreadByLinearIssue = useThreadStore((s) => s.getThreadByLinearIssue)
  const resetLayout = usePanelStore((s) => s.resetLayout)

  const handleCardClick = useCallback(
    async (issue: LinearIssue, projectId?: string) => {
      if (!connected) {
        console.warn('[useLinearCardClick] Gateway not connected')
        return
      }

      // Check if thread already exists for this issue
      const existingThread = getThreadByLinearIssue(issue.id)
      if (existingThread) {
        // Thread exists — just activate it
        setActiveThread(existingThread.id)
        return
      }

      // No existing thread — create a new one
      const threadId = generateThreadId()
      const sessionKey = generateSessionKey()
      const now = Date.now()

      try {
        // Create session via gateway RPC
        await request('sessions.patch', {
          key: sessionKey,
          label: `${issue.identifier}: ${issue.title}`
        })

        // Build thread with Linear context
        const newThread: Thread = {
          id: threadId,
          sessionKey,
          title: issue.title,
          subtitle: `${issue.identifier}: ${issue.state.name}`,
          linearIssueId: issue.id,
          projectId,
          status: 'idle',
          lastMessageAt: now,
          createdAt: now,
          metadata: {
            linearIdentifier: issue.identifier
          }
        }

        // Add to store
        addThread(newThread)

        // Reset panel layout for new thread
        resetLayout(threadId)

        // Activate the thread
        setActiveThread(threadId)
      } catch (err) {
        console.error('[useLinearCardClick] Failed to create thread:', err)
      }
    },
    [
      connected,
      request,
      addThread,
      setActiveThread,
      getThreadByLinearIssue,
      resetLayout
    ]
  )

  return handleCardClick
}
