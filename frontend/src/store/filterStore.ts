import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface FilterState {
  view: 'all' | 'mine' | 'delegated'
  due: 'all' | 'overdue' | 'upcoming'
  projectId: number | null
  searchQuery: string
  expandedProjects: number[]
  showDeferred: boolean
  showCompleted: boolean
  delegateId: number | null
  asOfDate: string | null
  setView: (view: FilterState['view']) => void
  setDue: (due: FilterState['due']) => void
  setProjectId: (id: number | null) => void
  setSearchQuery: (q: string) => void
  toggleProject: (id: number) => void
  setExpandedProjects: (ids: number[]) => void
  setShowDeferred: (v: boolean) => void
  setShowCompleted: (v: boolean) => void
  setDelegateId: (id: number | null) => void
  setAsOfDate: (d: string | null) => void
}

export const useFilterStore = create<FilterState>()(
  persist(
    (set) => ({
      view: 'all',
      due: 'all',
      projectId: null,
      searchQuery: '',
      expandedProjects: [],
      showDeferred: false,
      showCompleted: false,
      delegateId: null,
      asOfDate: null,
      setView: (view) => set({ view }),
      setDue: (due) => set({ due }),
      setProjectId: (projectId) => set({ projectId }),
      setSearchQuery: (searchQuery) => set({ searchQuery }),
      toggleProject: (id) =>
        set((s) => ({
          expandedProjects: s.expandedProjects.includes(id)
            ? s.expandedProjects.filter((x) => x !== id)
            : [...s.expandedProjects, id],
        })),
      setExpandedProjects: (ids) => set({ expandedProjects: ids }),
      setShowDeferred: (showDeferred) => set({ showDeferred }),
      setShowCompleted: (showCompleted) => set({ showCompleted }),
      setDelegateId: (delegateId) => set({ delegateId }),
      setAsOfDate: (asOfDate) => set({ asOfDate }),
    }),
    { name: 'taskflow_filters' }
  )
)
