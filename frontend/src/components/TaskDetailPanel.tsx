import { useEffect, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getTask, updateTask, deleteTask, getTaskChain } from '../api/tasks'
import { getComments, createComment } from '../api/comments'
import { CloseFollowUpModal } from './CloseFollowUpModal'
import { useToast } from './Toast'
import { useGlobalShortcuts } from '../hooks/useGlobalShortcuts'
import { formatFollowUpDate, getTaskStatus } from './TaskRow'
import { format, parseISO } from 'date-fns'
import type { User, ChainItem } from '../types'

interface TaskDetailPanelProps {
  taskId: number
  currentUser: User
  users: User[]
  onClose: () => void
  onNavigate: (taskId: number) => void
}

function DeferControl({ task, onDefer }: { task: { deferred_until?: string }, onDefer: (d: string | null) => void }) {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = tomorrow.toISOString().slice(0, 10)
  const isDeferred = !!task.deferred_until && task.deferred_until > new Date().toISOString().slice(0, 10)

  return (
    <div className="flex items-center gap-2">
      {isDeferred ? (
        <>
          <span className="text-xs text-upcoming-text flex-1">Deferred until {task.deferred_until}</span>
          <button
            onClick={() => onDefer(null)}
            className="text-xs text-text-muted hover:text-text-secondary px-2 py-1 rounded border border-border hover:border-text-muted transition-colors"
          >
            Undefer
          </button>
        </>
      ) : (
        <>
          <button
            onClick={() => onDefer(tomorrowStr)}
            className="flex-1 py-1.5 rounded text-xs font-medium border border-border text-text-muted hover:text-upcoming-text hover:border-upcoming-text transition-colors"
          >
            ⏭ Defer to Tomorrow
          </button>
          <input
            type="date"
            min={tomorrowStr}
            onChange={(e) => { if (e.target.value) onDefer(e.target.value) }}
            className="text-xs py-1 px-1.5 w-28"
            title="Defer until specific date"
          />
        </>
      )}
    </div>
  )
}

function ChainView({ taskId, currentTaskId, onNavigate }: { taskId: number; currentTaskId: number; onNavigate: (id: number) => void }) {
  const { data } = useQuery({
    queryKey: ['chain', taskId],
    queryFn: () => getTaskChain(taskId),
  })
  if (!data || data.chain.length <= 1) return null
  return (
    <div className="mb-4">
      <p className="text-xs text-text-muted uppercase tracking-wide mb-1">Follow-up Chain</p>
      <div className="space-y-0.5">
        {data.chain.map((item: ChainItem) => (
          <div
            key={item.id}
            className={`flex items-center gap-2 text-xs px-2 py-1 rounded cursor-pointer
              ${item.id === currentTaskId ? 'bg-elevated text-text-primary font-medium' : 'text-text-secondary hover:text-accent hover:bg-elevated/50'}`}
            onClick={() => item.id !== currentTaskId && onNavigate(item.id)}
          >
            <span className="text-text-muted w-4 text-right">{item.position < 0 ? '↩' : item.position === 0 ? '→' : '→'}</span>
            <span className={`flex-1 truncate ${item.status === 'closed' ? 'line-through text-text-muted' : ''}`}>{item.title}</span>
            {item.follow_up_date && <span className="text-text-muted font-mono">{formatFollowUpDate(item.follow_up_date)}</span>}
          </div>
        ))}
      </div>
    </div>
  )
}

export function TaskDetailPanel({ taskId, currentUser, users, onClose, onNavigate }: TaskDetailPanelProps) {
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  const [commentText, setCommentText] = useState('')
  const [showFollowUp, setShowFollowUp] = useState(false)
  const [savedField, setSavedField] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const commentRef = useRef<HTMLTextAreaElement>(null)

  const { data: task, isLoading } = useQuery({
    queryKey: ['task', taskId],
    queryFn: () => getTask(taskId),
  })

  const { data: comments = [] } = useQuery({
    queryKey: ['comments', taskId],
    queryFn: () => getComments(taskId),
    enabled: !!task,
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !showFollowUp) onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, showFollowUp])

  useGlobalShortcuts({
    'c': () => { if (task && !showFollowUp) completeMutation.mutate(!task.completed) },
    'f': () => { if (task && !task.completed && !showFollowUp) setShowFollowUp(true) },
    'd': () => {
      if (task && !showFollowUp) {
        const tomorrow = new Date()
        tomorrow.setDate(tomorrow.getDate() + 1)
        updateMutation.mutate({ deferred_until: tomorrow.toISOString().slice(0, 10) })
      }
    },
    'a': () => { commentRef.current?.focus() },
  })

  const updateMutation = useMutation({
    mutationFn: (data: Parameters<typeof updateTask>[1]) => updateTask(taskId, data),
    onSuccess: (updated) => {
      queryClient.setQueryData(['task', taskId], updated)
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      setSavedField('Saved ✓')
      setTimeout(() => setSavedField(null), 1500)
    },
    onError: (e: Error) => showToast(e.message, 'error'),
  })

  const completeMutation = useMutation({
    mutationFn: (done: boolean) =>
      updateTask(taskId, done ? { completed: true, status: 'closed' } : { completed: false, status: 'open' }),
    onSuccess: (_data, done) => {
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['task', taskId] })
      showToast(done ? 'Task marked complete' : 'Task reopened')
      if (done) onClose()
    },
    onError: (e: Error) => showToast(e.message, 'error'),
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteTask(taskId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      showToast('Task deleted')
      onClose()
    },
    onError: (e: Error) => showToast(e.message, 'error'),
  })

  const commentMutation = useMutation({
    mutationFn: () => createComment(taskId, commentText.trim()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', taskId] })
      setCommentText('')
    },
    onError: (e: Error) => showToast(e.message, 'error'),
  })

  if (isLoading || !task) {
    return (
      <div className="w-96 border-l border-border bg-surface flex items-center justify-center">
        <span className="text-text-muted text-sm">Loading...</span>
      </div>
    )
  }

  const taskStatus = getTaskStatus(task)

  return (
    <>
      <div ref={panelRef} className="w-[26rem] border-l border-border bg-surface flex flex-col overflow-hidden flex-shrink-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
          <span className="text-xs text-text-muted uppercase tracking-wide font-medium">Task Detail</span>
          <div className="flex items-center gap-2">
            {savedField && <span className="text-xs text-green-400">{savedField}</span>}
            <button onClick={onClose} className="text-text-muted hover:text-text-primary text-sm">✕</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="px-4 py-4 space-y-4">
            {taskStatus !== 'normal' && (
              <div className={`text-xs font-bold px-2 py-1 rounded w-fit
                ${taskStatus === 'overdue' ? 'bg-overdue-bg text-overdue-text' : 'bg-upcoming-bg text-upcoming-text'}`}>
                {taskStatus === 'overdue' ? '!! OVERDUE' : '~ DUE SOON'}
              </div>
            )}

            <div>
              <label className="block text-xs text-text-muted mb-1">Title</label>
              <textarea
                defaultValue={task.title}
                onBlur={(e) => {
                  if (e.target.value.trim() !== task.title) {
                    updateMutation.mutate({ title: e.target.value.trim() })
                  }
                }}
                rows={2}
                className="w-full text-sm resize-none font-medium"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <label className="block text-xs text-text-muted mb-1">Project</label>
                <span className="text-text-secondary">{task.project.name}</span>
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1">Entered</label>
                <span className="text-text-secondary font-mono text-xs">
                  {format(parseISO(task.date_entered), 'MMM d, yyyy')}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-text-muted mb-1">Owner</label>
                <select
                  defaultValue={task.delegated_to?.id ?? task.owner.id}
                  onChange={(e) => {
                    const uid = Number(e.target.value)
                    if (uid === currentUser.id) {
                      updateMutation.mutate({ owner_id: uid, delegated_to_id: null })
                    } else {
                      updateMutation.mutate({ delegated_to_id: uid })
                    }
                  }}
                  className="w-full text-sm"
                >
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.id === currentUser.id ? `me (${u.name})` : u.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1">Follow-up Date</label>
                <input
                  type="date"
                  defaultValue={task.follow_up_date ?? ''}
                  onBlur={(e) => {
                    if (e.target.value !== (task.follow_up_date ?? '')) {
                      updateMutation.mutate({ follow_up_date: e.target.value || undefined })
                    }
                  }}
                  className="w-full text-sm"
                />
              </div>
            </div>

            <ChainView taskId={taskId} currentTaskId={task.id} onNavigate={onNavigate} />

            <div>
              <p className="text-xs text-text-muted uppercase tracking-wide mb-2">Comments</p>
              <div className="space-y-3 mb-3">
                {comments.length === 0 && (
                  <p className="text-xs text-text-muted italic">No comments yet.</p>
                )}
                {comments.map((c) => (
                  <div key={c.id} className="text-sm">
                    <div className="flex items-baseline gap-2 mb-0.5">
                      <span className="font-medium text-text-secondary text-xs">{c.user.name}</span>
                      <span className="text-text-muted text-xs font-mono">
                        {format(parseISO(c.created_at), 'MMM d, HH:mm')}
                      </span>
                    </div>
                    <p className="text-text-primary pl-0">{c.content}</p>
                  </div>
                ))}
              </div>
              <textarea
                ref={commentRef}
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Add a comment..."
                rows={2}
                className="w-full text-sm resize-none"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && commentText.trim()) {
                    commentMutation.mutate()
                  }
                }}
              />
              <button
                onClick={() => commentMutation.mutate()}
                disabled={!commentText.trim() || commentMutation.isPending}
                className="mt-1.5 btn-secondary text-xs disabled:opacity-40"
              >
                Post Comment
              </button>
            </div>
          </div>
        </div>

        <div className="border-t border-border px-4 py-4 flex-shrink-0 space-y-2">
          {task.completed ? (
            <button
              onClick={() => completeMutation.mutate(false)}
              disabled={completeMutation.isPending}
              className="w-full py-2 rounded-md text-sm font-medium border border-border text-text-secondary hover:text-text-primary hover:border-text-secondary transition-colors disabled:opacity-40"
            >
              ↩ Reopen Task
            </button>
          ) : (
            <button
              onClick={() => completeMutation.mutate(true)}
              disabled={completeMutation.isPending}
              className="w-full py-2 rounded-md text-sm font-semibold bg-green-800 text-green-100 hover:bg-green-700 transition-colors disabled:opacity-40"
            >
              ✓ Mark Complete
            </button>
          )}

          <button
            onClick={() => setShowFollowUp(true)}
            disabled={task.status === 'closed'}
            className="w-full py-2 rounded-md text-sm font-medium border border-border text-text-secondary hover:text-text-primary hover:border-text-secondary transition-colors disabled:opacity-40"
          >
            Close & Follow Up →
          </button>

          <DeferControl task={task} onDefer={(d) => updateMutation.mutate({ deferred_until: d })} />

          <div className="flex justify-start pt-1">
            <button
              onClick={() => {
                if (window.confirm('Delete this task? This cannot be undone.')) {
                  deleteMutation.mutate()
                }
              }}
              className="btn-danger text-xs"
            >
              Delete Task
            </button>
          </div>
        </div>
      </div>

      {showFollowUp && (
        <CloseFollowUpModal
          task={task}
          users={users}
          currentUser={currentUser}
          onClose={() => setShowFollowUp(false)}
          onSuccess={(newTask) => onNavigate(newTask.id)}
        />
      )}
    </>
  )
}
