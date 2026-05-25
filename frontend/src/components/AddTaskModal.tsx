import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createTask } from '../api/tasks'
import { createComment } from '../api/comments'
import { useToast } from './Toast'
import type { Project, User } from '../types'
import { format, addDays } from 'date-fns'

interface AddTaskModalProps {
  projects: Project[]
  users: User[]
  currentUser: User
  defaultProjectId?: number
  onClose: () => void
}

export function AddTaskModal({ projects, users, currentUser, defaultProjectId, onClose }: AddTaskModalProps) {
  const openProjects = projects.filter((p) => p.status === 'open')
  const [projectId, setProjectId] = useState(defaultProjectId ?? openProjects[0]?.id ?? 0)
  const [title, setTitle] = useState('')
  const [ownerId, setOwnerId] = useState(currentUser.id)
  const [followUpDate, setFollowUpDate] = useState(format(addDays(new Date(), 7), 'yyyy-MM-dd'))
  const [initialComment, setInitialComment] = useState('')
  const { showToast } = useToast()
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async () => {
      const delegatedToId = ownerId !== currentUser.id ? ownerId : undefined
      const task = await createTask({
        theme_id: projectId,
        title: title.trim(),
        follow_up_date: followUpDate || undefined,
        delegated_to_id: delegatedToId,
      })
      if (initialComment.trim()) {
        await createComment(task.id, initialComment.trim())
      }
      return task
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      showToast('Task created')
      onClose()
    },
    onError: (e: Error) => showToast(e.message, 'error'),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-surface border border-border rounded-lg w-full max-w-md mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-text-primary">Add Task</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">✕</button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs text-text-secondary mb-1">Project</label>
            <select value={projectId} onChange={(e) => setProjectId(Number(e.target.value))} className="w-full text-sm">
              {openProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs text-text-secondary mb-1">Description</label>
            <textarea
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs to happen? Be specific and action-oriented."
              rows={2}
              className="w-full text-sm resize-none"
              autoFocus
            />
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs text-text-secondary mb-1">Owner</label>
              <select value={ownerId} onChange={(e) => setOwnerId(Number(e.target.value))} className="w-full text-sm">
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.id === currentUser.id ? `me (${u.name})` : u.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-xs text-text-secondary mb-1">Follow-up Date</label>
              <input type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} className="w-full text-sm" />
            </div>
          </div>

          <div>
            <label className="block text-xs text-text-secondary mb-1">Initial Comment (optional)</label>
            <textarea
              value={initialComment}
              onChange={(e) => setInitialComment(e.target.value)}
              placeholder="Any context to log now?"
              rows={2}
              className="w-full text-sm resize-none"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-border">
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!title.trim() || !projectId || mutation.isPending}
            className="btn-primary disabled:opacity-40"
          >
            {mutation.isPending ? 'Adding...' : 'Add Task →'}
          </button>
        </div>
      </div>
    </div>
  )
}
