import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getDashboardByProject, getDashboard } from '../api/dashboard'
import { updateTask, getTasks } from '../api/tasks'
import { getUsers } from '../api/users'
import { getProjects } from '../api/themes'
import { useAuthStore } from '../store/authStore'
import { useFilterStore } from '../store/filterStore'
import { FilterBar } from '../components/FilterBar'
import { ProjectSection } from '../components/ThemeSection'
import { TaskDetailPanel } from '../components/TaskDetailPanel'
import { AddTaskModal } from '../components/AddTaskModal'
import { AddProjectModal } from '../components/AddThemeModal'
import { BulkActionBar } from '../components/BulkActionBar'
import { ShortcutsHelp } from '../components/ShortcutsHelp'
import { useGlobalShortcuts } from '../hooks/useGlobalShortcuts'
import { useAuth } from '../hooks/useAuth'
import type { Task, ProjectWithTasks } from '../types'

export function DashboardPage() {
  const { currentUser } = useAuthStore()
  const { logout } = useAuth()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const {
    view, due, projectId: filterProjectId, searchQuery, expandedProjects, setExpandedProjects, setView,
    showDeferred, showCompleted, delegateId, asOfDate,
  } = useFilterStore()

  const today = asOfDate ?? new Date().toISOString().slice(0, 10)
  const [activeTaskId, setActiveTaskId] = useState<number | null>(null)
  const [showAddTask, setShowAddTask] = useState(false)
  const [showAddProject, setShowAddProject] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [keyboardIndex, setKeyboardIndex] = useState<number>(-1)
  const searchRef = useRef<HTMLInputElement>(null)
  const [addTaskProjectId, setAddTaskProjectId] = useState<number | undefined>()
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const visibleTasksRef = useRef<Task[]>([])

  const { data: summary } = useQuery({
    queryKey: ['dashboard'],
    queryFn: getDashboard,
    refetchInterval: 30000,
  })

  const { data: projectGroups = [] } = useQuery({
    queryKey: ['dashboard', 'by-project'],
    queryFn: getDashboardByProject,
    refetchInterval: 30000,
  })

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: getUsers,
  })

  const { data: allProjects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => getProjects('all'),
  })

  const { data: allCompletedTasks = [] } = useQuery({
    queryKey: ['tasks', 'completed'],
    queryFn: () => getTasks({ completed: true, status: 'all' }),
    enabled: showCompleted,
    refetchInterval: 30000,
  })

  // Auto-expand all projects on first data load when nothing is expanded
  const hasAutoExpanded = useRef(false)
  useEffect(() => {
    if (!hasAutoExpanded.current && projectGroups.length > 0 && expandedProjects.length === 0) {
      hasAutoExpanded.current = true
      setExpandedProjects(projectGroups.map((g) => g.project.id))
    }
  }, [projectGroups.length])

  const navigate_kb = useCallback((dir: 1 | -1) => {
    const len = visibleTasksRef.current.length
    if (len === 0) return
    setKeyboardIndex((prev) => {
      const next = prev + dir
      if (next < 0) return 0
      if (next >= len) return len - 1
      return next
    })
  }, [])

  useEffect(() => {
    if (keyboardIndex >= 0) {
      document.querySelector('[data-keyboard-focused]')?.scrollIntoView({ block: 'nearest' })
    }
  }, [keyboardIndex])

  const anyModalOpen = showAddTask || showAddProject || showHelp

  const currentUserId = currentUser?.id ?? 0

  const filteredGroups: ProjectWithTasks[] = useMemo(() => {
    let groups = projectGroups

    if (filterProjectId) {
      groups = groups.filter((g) => g.project.id === filterProjectId)
    }

    return groups.map((group) => {
      let tasks = group.tasks

      if (asOfDate) {
        tasks = tasks.filter((t) => t.date_entered.slice(0, 10) <= asOfDate)
      }

      if (view === 'mine') {
        tasks = tasks.filter((t) => t.owner.id === currentUserId && t.delegated_to == null)
      } else if (view === 'delegated') {
        tasks = tasks.filter((t) => t.delegated_to != null)
        if (delegateId) {
          tasks = tasks.filter((t) => t.delegated_to?.id === delegateId)
        }
      }

      if (!showDeferred) {
        tasks = tasks.filter((t) => !t.deferred_until || t.deferred_until <= today)
      }

      if (due === 'overdue') {
        tasks = tasks.filter((t) => t.follow_up_date && t.follow_up_date < today)
      } else if (due === 'upcoming') {
        const limit = new Date(today)
        limit.setDate(limit.getDate() + 5)
        const limitStr = limit.toISOString().slice(0, 10)
        tasks = tasks.filter((t) => !!t.follow_up_date && t.follow_up_date >= today && t.follow_up_date <= limitStr)
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        tasks = tasks.filter((t) => t.title.toLowerCase().includes(q))
      }

      return { ...group, tasks }
    })
  }, [projectGroups, view, due, filterProjectId, searchQuery, currentUserId, showDeferred, delegateId, asOfDate, today])

  const completedByProject = useMemo((): Record<number, Task[]> => {
    if (!showCompleted) return {}
    let tasks = allCompletedTasks
    if (asOfDate) tasks = tasks.filter((t) => t.date_entered.slice(0, 10) <= asOfDate)
    if (view === 'mine') tasks = tasks.filter((t) => t.owner.id === currentUserId && t.delegated_to == null)
    else if (view === 'delegated') {
      tasks = tasks.filter((t) => t.delegated_to != null)
      if (delegateId) tasks = tasks.filter((t) => t.delegated_to?.id === delegateId)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      tasks = tasks.filter((t) => t.title.toLowerCase().includes(q))
    }
    const result: Record<number, Task[]> = {}
    tasks.forEach((t) => {
      if (!result[t.project.id]) result[t.project.id] = []
      result[t.project.id].push(t)
    })
    return result
  }, [allCompletedTasks, showCompleted, view, asOfDate, currentUserId, delegateId, searchQuery])

  const visibleTasks = useMemo(() =>
    filteredGroups.flatMap((g) =>
      expandedProjects.includes(g.project.id) ? g.tasks : []
    ), [filteredGroups, expandedProjects])
  visibleTasksRef.current = visibleTasks

  const handleSelect = (id: number, checked: boolean) => {
    setSelectedIds((prev) => checked ? [...prev, id] : prev.filter((x) => x !== id))
  }

  const handleOpenTask = (task: Task) => {
    setActiveTaskId(task.id)
    if (!expandedProjects.includes(task.project.id)) {
      setExpandedProjects([...expandedProjects, task.project.id])
    }
  }

  const handleAddTask = (projectId?: number) => {
    setAddTaskProjectId(projectId)
    setShowAddTask(true)
  }

  const handleDefer = async (taskId: number) => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const tomorrowStr = tomorrow.toISOString().slice(0, 10)
    await updateTask(taskId, { deferred_until: tomorrowStr })
    queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    queryClient.invalidateQueries({ queryKey: ['task', taskId] })
  }

  useGlobalShortcuts({
    'n': () => { if (!anyModalOpen) { setShowAddTask(true) } },
    't': () => { if (!anyModalOpen) { setShowAddProject(true) } },
    '/': () => { searchRef.current?.focus() },
    '1': () => { if (!anyModalOpen) setView('all') },
    '2': () => { if (!anyModalOpen) setView('mine') },
    '3': () => { if (!anyModalOpen) setView('delegated') },
    '?': () => { if (!anyModalOpen) setShowHelp(true) },
    'Escape': () => {
      if (showHelp) { setShowHelp(false); return }
      if (activeTaskId) { setActiveTaskId(null); setKeyboardIndex(-1) }
    },
    'ArrowDown': () => { if (!anyModalOpen) navigate_kb(1) },
    'ArrowUp':   () => { if (!anyModalOpen) navigate_kb(-1) },
    'Enter': () => {
      if (!anyModalOpen && keyboardIndex >= 0) {
        const task = visibleTasksRef.current[keyboardIndex]
        if (task) handleOpenTask(task)
      }
    },
  })

  if (!currentUser) {
    navigate('/login')
    return null
  }

  const openProjects = allProjects.filter((p) => p.status === 'open')
  const closedProjects = allProjects.filter((p) => p.status === 'closed')

  // In mine/delegated views, hide projects with no visible tasks (open or completed)
  const visibleGroups = filteredGroups.filter((group) =>
    view === 'all' ||
    group.tasks.length > 0 ||
    (showCompleted && (completedByProject[group.project.id]?.length ?? 0) > 0)
  )

  return (
    <div className="min-h-screen flex flex-col bg-base">
      {/* Header */}
      <header className="sticky top-0 z-30 flex items-center gap-4 px-4 py-2.5 bg-base border-b border-border">
        <span className="font-bold text-text-primary">◈ TaskFlow</span>

        <div className="relative ml-1">
          <button
            onClick={() => setUserMenuOpen((o) => !o)}
            className="text-sm text-text-secondary hover:text-text-primary flex items-center gap-1"
          >
            {currentUser.name} <span className="text-text-muted">▾</span>
          </button>
          {userMenuOpen && (
            <div className="absolute top-full left-0 mt-1 bg-elevated border border-border rounded-md shadow-lg py-1 z-50 min-w-36">
              <button
                onClick={() => { setUserMenuOpen(false); logout() }}
                className="w-full text-left px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary hover:bg-border transition-colors"
              >
                Switch User
              </button>
            </div>
          )}
        </div>

        <div className="flex-1" />

        <button onClick={() => setShowAddProject(true)} className="btn-ghost text-sm">+ Project</button>
        <button onClick={() => handleAddTask()} className="btn-primary text-sm">+ New Task</button>
        <button onClick={() => navigate('/settings/team')} className="btn-ghost text-sm">⚙</button>
        <button onClick={() => setShowHelp(true)} className="btn-ghost text-sm text-text-muted" title="Keyboard shortcuts">?</button>
      </header>

      <FilterBar
        projects={openProjects}
        users={users}
        overdueCount={summary?.overdue_count ?? 0}
        upcomingCount={summary?.upcoming_count ?? 0}
        searchRef={searchRef}
      />

      {selectedIds.length > 0 && (
        <BulkActionBar
          selectedIds={selectedIds}
          users={users}
          onCancel={() => setSelectedIds([])}
        />
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Task list */}
        <div className={`flex-1 overflow-y-auto ${activeTaskId ? 'opacity-70' : ''}`}>
          {visibleGroups.length === 0 && projectGroups.length === 0 && (
            <div className="text-center py-20 text-text-muted">
              <div className="text-4xl mb-4">◈</div>
              <p className="font-medium mb-1">No projects yet</p>
              <p className="text-sm">Create a project to organize your tasks.</p>
            </div>
          )}

          {visibleGroups.map((group) => {
            const groupOffset = visibleTasks.findIndex((t) => t.id === group.tasks[0]?.id)
            return (
              <ProjectSection
                key={group.project.id}
                project={group.project}
                tasks={group.tasks}
                completedTasks={completedByProject[group.project.id]}
                overdueCount={group.overdue_count}
                currentUser={currentUser}
                selectedIds={selectedIds}
                onSelect={handleSelect}
                onView={(task) => { handleOpenTask(task); setKeyboardIndex(visibleTasks.findIndex(t => t.id === task.id)) }}
                onAddTask={handleAddTask}
                onDefer={handleDefer}
                activeTaskId={activeTaskId ?? undefined}
                keyboardFocusIndex={keyboardIndex - groupOffset}
              />
            )
          })}

          {closedProjects.length > 0 && (
            <div className="mt-4 px-3">
              <p className="text-xs text-text-muted uppercase tracking-wide mb-2">Closed Projects</p>
              <div className="flex flex-wrap gap-2">
                {closedProjects.map((p) => (
                  <span key={p.id} className="text-xs text-text-muted bg-elevated border border-border rounded px-2 py-1">
                    {p.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Task detail panel */}
        {activeTaskId && (
          <TaskDetailPanel
            taskId={activeTaskId}
            currentUser={currentUser}
            users={users}
            onClose={() => setActiveTaskId(null)}
            onNavigate={(id) => setActiveTaskId(id)}
          />
        )}
      </div>

      {showHelp && <ShortcutsHelp onClose={() => setShowHelp(false)} />}
      {showAddProject && <AddProjectModal onClose={() => setShowAddProject(false)} />}

      {showAddTask && (
        <AddTaskModal
          projects={allProjects}
          users={users}
          currentUser={currentUser}
          defaultProjectId={addTaskProjectId}
          onClose={() => setShowAddTask(false)}
        />
      )}
    </div>
  )
}
