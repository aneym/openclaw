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
  /** Session kind from gateway (direct, group, global, etc.) */
  kind?: string
  /** Timestamp when thread was archived */
  archivedAt?: number
}

const STORAGE_KEY = 'openclaw.threads'

function generateId(): string {
  const hex = () => Math.random().toString(16).slice(2, 6)
  return `${hex()}${hex()}-${hex()}-4${hex().slice(1)}-${hex()}-${hex()}${hex()}${hex()}`
}

function dedup(list: ThreadDescriptor[]): ThreadDescriptor[] {
  const seen = new Set<string>()
  const result: ThreadDescriptor[] = []
  for (const t of list) {
    if (seen.has(t.id)) continue
    seen.add(t.id)
    result.push(t)
  }
  return result
}

function loadDescriptors(): ThreadDescriptor[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? dedup(parsed) : []
  } catch {
    return []
  }
}

function saveDescriptors(descriptors: ThreadDescriptor[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(dedup(descriptors)))
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

/** Simple hash of a string to a hex ID, for stable dedup-safe keys. */
function hashKey(str: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

/** Convert a gateway SessionEntry into a ThreadDescriptor. */
function sessionToDescriptor(
  session: SessionEntry,
  parentSessionKey: string,
): ThreadDescriptor {
  // Extract a stable ID from the session key — find :thread:{uuid} at any position
  const parts = session.key.split(':')
  const threadIdx = parts.indexOf('thread')
  const threadPart = threadIdx >= 0 ? parts[threadIdx + 1] : undefined
  // Use the thread UUID if available, otherwise hash the session key for a safe ID
  const id = threadPart || `remote-${hashKey(session.key)}`
  const ts = session.updatedAt ?? Date.now()

  return {
    id,
    sessionKey: session.key,
    label:
      session.displayName ||
      session.derivedTitle ||
      session.label ||
      humanizeSessionKey(session.key),
    createdAt: ts,
    lastActivityAt: ts,
    parentSessionKey,
    isLocal: false,
    kind: session.kind,
    archivedAt: session.archivedAt,
  }
}

export interface ThreadSection {
  title: string
  data: ThreadDescriptor[]
}

const ACTIVE_THRESHOLD_MS = 1_200_000 // 20 minutes

function isCronThread(t: ThreadDescriptor): boolean {
  const key = t.sessionKey.toLowerCase()
  return key.includes(':cron:') || key.includes(':cron-') || t.kind === 'global'
}

/** Group threads matching web UI: Active, Older, Automated, Archived */
export function groupThreads(threads: ThreadDescriptor[]): ThreadSection[] {
  if (threads.length === 0) return []

  const now = Date.now()
  const active: ThreadDescriptor[] = []
  const older: ThreadDescriptor[] = []
  const automated: ThreadDescriptor[] = []
  const archived: ThreadDescriptor[] = []

  for (const t of threads) {
    if (t.archivedAt) {
      archived.push(t)
    } else if (isCronThread(t)) {
      automated.push(t)
    } else if (t.lastActivityAt && now - t.lastActivityAt < ACTIVE_THRESHOLD_MS) {
      active.push(t)
    } else {
      older.push(t)
    }
  }

  const sections: ThreadSection[] = []
  if (active.length > 0) sections.push({ title: 'Active', data: active })
  if (older.length > 0) sections.push({ title: 'Older', data: older })
  if (automated.length > 0) sections.push({ title: 'Automated', data: automated })
  if (archived.length > 0) sections.push({ title: 'Archived', data: archived })
  return sections
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

  // Merge local + remote, then hard-dedup by id
  const allThreads = [...localThreads, ...remoteThreads]
  const seenIds = new Set<string>()
  const deduped: ThreadDescriptor[] = []
  for (const t of allThreads) {
    if (seenIds.has(t.id)) continue
    seenIds.add(t.id)
    deduped.push(t)
  }
  const merged = deduped.sort(
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
