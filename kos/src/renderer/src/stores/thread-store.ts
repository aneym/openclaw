import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Thread } from '../types'

interface ThreadState {
  threads: Map<string, Thread>
  activeThreadId: string | null

  setActiveThread: (id: string) => void
  addThread: (thread: Thread) => void
  updateThread: (id: string, patch: Partial<Thread>) => void
  archiveThread: (id: string) => void
  getThread: (id: string) => Thread | undefined
  getThreadsByProject: (projectId: string) => Thread[]
}

export const useThreadStore = create<ThreadState>()(
  persist(
    (set, get) => ({
      threads: new Map(),
      activeThreadId: null,

      setActiveThread: (id: string) => {
        set({ activeThreadId: id })
      },

      addThread: (thread: Thread) => {
        const { threads } = get()
        const updated = new Map(threads)
        updated.set(thread.id, thread)
        set({ threads: updated })
      },

      updateThread: (id: string, patch: Partial<Thread>) => {
        const { threads } = get()
        const thread = threads.get(id)
        if (thread) {
          const updated = new Map(threads)
          updated.set(id, { ...thread, ...patch })
          set({ threads: updated })
        }
      },

      archiveThread: (id: string) => {
        const { threads, activeThreadId } = get()
        const thread = threads.get(id)
        if (thread) {
          const updated = new Map(threads)
          updated.set(id, { ...thread, status: 'archived' })
          set({
            threads: updated,
            activeThreadId: activeThreadId === id ? null : activeThreadId
          })
        }
      },

      getThread: (id: string) => {
        return get().threads.get(id)
      },

      getThreadsByProject: (projectId: string) => {
        const { threads } = get()
        return Array.from(threads.values()).filter(
          (t) => t.projectId === projectId && t.status !== 'archived'
        )
      }
    }),
    {
      name: 'kos-threads',
      // Custom storage to handle Map serialization
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name)
          if (!str) return null
          const { state } = JSON.parse(str)
          return {
            state: {
              ...state,
              threads: new Map(state.threads || [])
            }
          }
        },
        setItem: (name, value) => {
          const { state } = value
          localStorage.setItem(
            name,
            JSON.stringify({
              state: {
                ...state,
                threads: Array.from(state.threads.entries())
              }
            })
          )
        },
        removeItem: (name) => localStorage.removeItem(name)
      }
    }
  )
)
