import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Project } from '../types'

interface ProjectState {
  projects: Map<string, Project>
  expandedProjectIds: Set<string>
  selectedProjectId: string | null

  addProject: (project: Project) => void
  updateProject: (id: string, patch: Partial<Project>) => void
  getProject: (id: string) => Project | undefined
  getProjectsByWorkspace: (workspaceId: string) => Project[]
  toggleExpanded: (id: string) => void
  isExpanded: (id: string) => boolean
  setSelectedProject: (id: string | null) => void
}

export const useProjectStore = create<ProjectState>()(
  persist(
    (set, get) => ({
      projects: new Map(),
      expandedProjectIds: new Set(),
      selectedProjectId: null,

      addProject: (project: Project) => {
        const { projects } = get()
        const updated = new Map(projects)
        updated.set(project.id, project)
        set({ projects: updated })
      },

      updateProject: (id: string, patch: Partial<Project>) => {
        const { projects } = get()
        const project = projects.get(id)
        if (project) {
          const updated = new Map(projects)
          updated.set(id, { ...project, ...patch })
          set({ projects: updated })
        }
      },

      getProject: (id: string) => {
        return get().projects.get(id)
      },

      getProjectsByWorkspace: (workspaceId: string) => {
        const { projects } = get()
        return Array.from(projects.values())
          .filter((p) => p.workspaceId === workspaceId)
          .sort((a, b) => a.name.localeCompare(b.name))
      },

      toggleExpanded: (id: string) => {
        const { expandedProjectIds } = get()
        const updated = new Set(expandedProjectIds)
        if (updated.has(id)) {
          updated.delete(id)
        } else {
          updated.add(id)
        }
        set({ expandedProjectIds: updated })
      },

      isExpanded: (id: string) => {
        return get().expandedProjectIds.has(id)
      },

      setSelectedProject: (id: string | null) => {
        set({ selectedProjectId: id })
      }
    }),
    {
      name: 'kos-projects',
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name)
          if (!str) return null
          const { state } = JSON.parse(str)
          return {
            state: {
              ...state,
              projects: new Map(state.projects || []),
              expandedProjectIds: new Set(state.expandedProjectIds || [])
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
                projects: Array.from(state.projects.entries()),
                expandedProjectIds: Array.from(state.expandedProjectIds)
              }
            })
          )
        },
        removeItem: (name) => localStorage.removeItem(name)
      }
    }
  )
)
