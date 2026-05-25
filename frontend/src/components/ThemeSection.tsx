import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateProject } from '../api/themes'
import { TaskRow } from './TaskRow'
import { useToast } from './Toast'
import { useFilterStore } from '../store/filterStore'
import type { Task, Project, User } from '../types'

interface ProjectSectionProps {
  project: Project
  tasks: Task[]
  completedTasks?: Task[]
  overdueCount: number
  currentUser: User
  selectedIds: number[]
  onSelect: (id: number, checked: boolean) => void
  onView: (task: Task) => void
  onAddTask: (projectId: number) => void
  onDefer?: (taskId: number) => void
  activeTaskId?: number
  keyboardFocusIndex?: number
}

export function ProjectSection({
  project, tasks, completedTasks, overdueCount, currentUser, selectedIds, onSelect, onView, onAddTask, onDefer, activeTaskId, keyboardFocusIndex = -1
}: ProjectSectionProps) {
  const { expandedProjects, toggleProject } = useFilterStore()
  const isExpanded = expandedProjects.includes(project.id)
  const [confirmClose, setConfirmClose] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(project.name)
  const [editDesc, setEditDesc] = useState(project.description ?? '')
  const nameRef = useRef<HTMLInputElement>(null)
  const { showToast } = useToast()
  const queryClient = useQueryClient()

  useEffect(() => {
    if (editing) nameRef.current?.focus()
  }, [editing])

  const saveMutation = useMutation({
    mutationFn: () => updateProject(project.id, {
      name: editName.trim() || project.name,
      description: editDesc.trim() || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      setEditing(false)
    },
    onError: (e: Error) => showToast(e.message, 'error'),
  })

  const closeMutation = useMutation({
    mutationFn: () => updateProject(project.id, { status: 'closed' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      showToast(`Project "${project.name}" closed`)
      setConfirmClose(false)
    },
    onError: (e: Error) => showToast(e.message, 'error'),
  })

  const anySelected = tasks.some((t) => selectedIds.includes(t.id))

  const cancelEdit = () => {
    setEditName(project.name)
    setEditDesc(project.description ?? '')
    setEditing(false)
  }

  return (
    <div className={`border-b border-border ${project.status === 'closed' ? 'opacity-50' : ''}`}>
      <div className="flex items-center gap-2 px-3 py-2 bg-elevated/50">

        {editing ? (
          <div className="flex items-center gap-2 flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
            <input
              ref={nameRef}
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveMutation.mutate()
                if (e.key === 'Escape') cancelEdit()
              }}
              className="text-xs font-semibold uppercase tracking-wide bg-base border border-accent rounded px-2 py-0.5 w-40"
            />
            <input
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveMutation.mutate()
                if (e.key === 'Escape') cancelEdit()
              }}
              placeholder="Description (optional)"
              className="text-xs flex-1 min-w-0 bg-base border border-border rounded px-2 py-0.5 text-text-secondary"
            />
            <button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="text-xs text-accent hover:text-indigo-400 px-1 font-medium"
            >
              {saveMutation.isPending ? '...' : 'Save'}
            </button>
            <button onClick={cancelEdit} className="text-xs text-text-muted hover:text-text-secondary px-1">
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => toggleProject(project.id)}
            className="flex items-center gap-2 flex-1 text-left min-w-0"
          >
            <span className="text-text-muted text-xs">{isExpanded ? '▼' : '▶'}</span>
            <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide truncate">
              {project.name}
            </span>
            {project.description && (
              <span className="text-xs text-text-muted truncate hidden sm:inline">{project.description}</span>
            )}
            <span className="text-xs text-text-muted ml-1 flex-shrink-0">
              {project.open_task_count} task{project.open_task_count !== 1 ? 's' : ''}
              {overdueCount > 0 && <span className="text-overdue-text ml-1">· {overdueCount} overdue</span>}
            </span>
          </button>
        )}

        {project.status === 'open' && !editing && (
          <div className="flex items-center gap-1 flex-shrink-0">
            {confirmClose ? (
              <span className="flex items-center gap-1 text-xs">
                <span className="text-text-secondary">Close "{project.name}"? Tasks stay open.</span>
                <button onClick={() => setConfirmClose(false)} className="text-text-muted hover:text-text-secondary px-1">Cancel</button>
                <button
                  onClick={() => closeMutation.mutate()}
                  disabled={closeMutation.isPending}
                  className="text-red-400 hover:text-red-300 px-1 font-medium"
                >
                  {closeMutation.isPending ? '...' : 'Confirm Close'}
                </button>
              </span>
            ) : (
              <>
                <button
                  onClick={() => setEditing(true)}
                  className="text-xs text-text-muted hover:text-text-secondary px-2 py-0.5 rounded hover:bg-elevated transition-colors"
                  title="Edit project name / description"
                >
                  Edit
                </button>
                <button
                  onClick={() => onAddTask(project.id)}
                  className="text-xs text-text-muted hover:text-accent px-2 py-0.5 rounded hover:bg-elevated transition-colors"
                >
                  + Add
                </button>
                <button
                  onClick={() => setConfirmClose(true)}
                  className="text-xs text-text-muted hover:text-red-400 px-2 py-0.5 rounded hover:bg-elevated transition-colors"
                >
                  Close
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {isExpanded && (
        <div>
          {tasks.length === 0 && (!completedTasks || completedTasks.length === 0) ? (
            <div className="px-6 py-3 text-xs text-text-muted italic">No tasks match filters.</div>
          ) : (
            tasks.map((task, i) => (
              <div
                key={task.id}
                data-keyboard-focused={i === keyboardFocusIndex ? '' : undefined}
                className={activeTaskId === task.id ? 'bg-accent/10' : ''}
                style={i === keyboardFocusIndex && activeTaskId !== task.id ? {
                  background: 'rgba(99,102,241,0.18)',
                  borderLeft: '3px solid #6366f1',
                } : undefined}
              >
                <TaskRow
                  task={task}
                  currentUser={currentUser}
                  isSelected={selectedIds.includes(task.id)}
                  showCheckbox={anySelected}
                  onSelect={onSelect}
                  onView={onView}
                  onDefer={onDefer}
                />
              </div>
            ))
          )}

          {completedTasks && completedTasks.length > 0 && completedTasks.map((task) => (
            <div key={task.id} className={`opacity-50 ${activeTaskId === task.id ? 'opacity-100 bg-accent/10' : ''}`}>
              <TaskRow
                task={task}
                currentUser={currentUser}
                isSelected={false}
                showCheckbox={false}
                onSelect={() => {}}
                onView={onView}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
