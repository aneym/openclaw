import { useCallback, useEffect, useRef, useState } from 'react'
import { useGateway } from './use-gateway'
import type { SessionEntry, SessionsListResult } from './gateway-types'

export interface ThreadDescriptor {
  id: string
  sessionKey: string
  label: string
  createdAt: number
  lastActivityAt: number
  parentSessionKey: string
  /** True for threads created locally (not from gateway sessions.list) */
  isLocal?: boolean
}

const STORAGE_KEY = 'openclaw.threads'

function generateId(): string {
  const hex = () => Math.random().toString(16).slice(2, 6)
  return `${hex()}${hex()}-${hex()}-4${hex().slice(1)}-${hex()}-${hex()}${hex()}${hex()}`
}

function loadDescriptors(): ThreadDescriptor[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveDescriptors(descriptors: ThreadDescriptor[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(descriptors))
}

/** Derive a human-readable label from a gateway session key. */
function humanizeSessionKey(key: string): string {
  const parts = key.split(':')
  if (parts[0] === 'agent' && parts.length >= 3) {
    const channel = parts[2]
    if (parts[3] === 'thread' && parts[4]) {
      return `Thread ${parts[4].slice(0, 6)}`
    }
    if (channel === 'cron' && parts[3]) {
      return `Cron ${parts[3].slice(0, 6)}`
    }
    const rest = parts.slice(3).join(':')
    const name = channel.charAt(0).toUpperCase() + channel.slice(1)
    return rest ? `${name} ${rest.slice(0, 24)}` : name
  }
  if (parts.length >= 2) {
    const channel = parts[0]
    const rest = parts.slice(1).join(':')
    const name = channel.charAt(0).toUpperCase() + channel.slice(1)
    return `${name} ${rest.slice(0, 24)}`
  }
  return key.slice(0, 30)
}

/** Convert a gateway SessionEntry into a ThreadDescriptor. */
function sessionToDescriptor(
  session: SessionEntry,
  parentSessionKey: string,
): ThreadDescriptor {
  // Extract a stable ID from the session key
  const parts = session.key.split(':')
  const threadPart = parts[3] === 'thread' ? parts[4] : undefined
  const id = threadPart || session.key

  return {
    id,
    sessionKey: session.key,
    label:
      session.displayName ||
      session.label ||
      humanizeSessionKey(session.key),
    createdAt: session.lastActivityAt || Date.now(),
    lastActivityAt: session.lastActivityAt || Date.now(),
    parentSessionKey,
    isLocal: false,
  }
}

export interface UseThreadsReturn {
  threads: ThreadDescriptor[]
  loading: boolean
  createThread: (label?: string) => ThreadDescriptor
  deleteThread: (id: string) => void
  renameThread: (id: string, label: string) => void
  updateActivity: (id: string) => void
}

export function useThreads(): UseThreadsReturn {
  const { client, state, hello } = useGateway()
  const [localThreads, setLocalThreads] = useState<ThreadDescriptor[]>(
    () => loadDescriptors(),
  )
  const [remoteThreads, setRemoteThreads] = useState<ThreadDescriptor[]>([])
  const [loading, setLoading] = useState(false)
  const localRef = useRef(localThreads)
  localRef.current = localThreads

  const parentSessionKey =
    hello?.snapshot?.sessionDefaults?.mainSessionKey || ''

  const persist = useCallback((next: ThreadDescriptor[]) => {
    setLocalThreads(next)
    saveDescriptors(next)
  }, [])

  // Fetch gateway sessions on connect
  useEffect(() => {
    if (!client || state !== 'connected' || !parentSessionKey) {
      setRemoteThreads([])
      return
    }
    setLoading(true)
    client
      .request<SessionsListResult>('sessions.list', { activeMinutes: 10080 })
      .then((res) => {
        if (!res.sessions) return
        const descriptors = res.sessions.map((s) =>
          sessionToDescriptor(s, parentSessionKey),
        )
        setRemoteThreads(descriptors)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [client, state, parentSessionKey])

  const createThread = useCallback(
    (label?: string): ThreadDescriptor => {
      const id = generateId()
      const now = Date.now()
      const descriptor: ThreadDescriptor = {
        id,
        sessionKey: parentSessionKey
          ? `${parentSessionKey}:thread:${id}`
          : `thread:${id}`,
        label: label || 'New thread',
        createdAt: now,
        lastActivityAt: now,
        parentSessionKey,
        isLocal: true,
      }
      const next = [descriptor, ...localRef.current]
      persist(next)
      return descriptor
    },
    [parentSessionKey, persist],
  )

  const deleteThread = useCallback(
    (id: string) => {
      // Remove from local threads
      const next = localRef.current.filter((t) => t.id !== id)
      persist(next)
      // Also remove from remote if present
      setRemoteThreads((prev) => prev.filter((t) => t.id !== id))
    },
    [persist],
  )

  const renameThread = useCallback(
    (id: string, label: string) => {
      // Check local first
      const isLocal = localRef.current.some((t) => t.id === id)
      if (isLocal) {
        const next = localRef.current.map((t) =>
          t.id === id ? { ...t, label } : t,
        )
        persist(next)
      } else {
        // Promote remote thread to local with new label
        setRemoteThreads((prev) => {
          const target = prev.find((t) => t.id === id)
          if (target) {
            const promoted = { ...target, label, isLocal: true }
            const remaining = prev.filter((t) => t.id !== id)
            setRemoteThreads(remaining)
            persist([promoted, ...localRef.current])
          }
          return prev
        })
      }
    },
    [persist],
  )

  const updateActivity = useCallback(
    (id: string) => {
      const isLocal = localRef.current.some((t) => t.id === id)
      if (isLocal) {
        const next = localRef.current.map((t) =>
          t.id === id ? { ...t, lastActivityAt: Date.now() } : t,
        )
        persist(next)
      } else {
        setRemoteThreads((prev) =>
          prev.map((t) =>
            t.id === id ? { ...t, lastActivityAt: Date.now() } : t,
          ),
        )
      }
    },
    [persist],
  )

  // Re-resolve local session keys if parentSessionKey changes
  useEffect(() => {
    if (!parentSessionKey) return
    const current = localRef.current
    const needsUpdate = current.some(
      (t) => t.isLocal !== false && t.parentSessionKey !== parentSessionKey,
    )
    if (needsUpdate) {
      const updated = current.map((t) =>
        t.isLocal !== false
          ? {
              ...t,
              parentSessionKey,
              sessionKey: `${parentSessionKey}:thread:${t.id}`,
            }
          : t,
      )
      persist(updated)
    }
  }, [parentSessionKey, persist])

  // Merge local + remote, dedup by sessionKey, sort by lastActivityAt
  const localKeys = new Set(localThreads.map((t) => t.sessionKey))
  const uniqueRemote = remoteThreads.filter(
    (t) => !localKeys.has(t.sessionKey),
  )
  const merged = [...localThreads, ...uniqueRemote].sort(
    (a, b) => b.lastActivityAt - a.lastActivityAt,
  )

  return {
    threads: merged,
    loading,
    createThread,
    deleteThread,
    renameThread,
    updateActivity,
  }
}
