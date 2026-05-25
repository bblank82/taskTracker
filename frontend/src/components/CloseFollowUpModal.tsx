import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { closeAndFollowUp, updateTask } from '../api/tasks'
import { useToast } from './Toast'
import type { Task, User } from '../types'
import { format, addDays } from 'date-fns'

interface CloseFollowUpModalProps {
  task: Task
  users: User[]
  currentUser: User
  onClose: () => void
  onSuccess: (newTask: Task) => void
}

export function CloseFollowUpModal({ task, users, currentUser, onClose, onSuccess }: CloseFollowUpModalProps) {
  const [title, setTitle] = useState(task.title)
  const [ownerId, setOwnerId] = useState(task.delegated_to?.id ?? currentUser.id)
  const [followUpDate, setFollowUpDate] = useState(format(addDays(new Date(), 7), 'yyyy-MM-dd'))
  const { showToast } = useToast()
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: () =>
      closeAndFollowUp(task.id, {
        title: title.trim(),
        follow_up_date: followUpDate || undefined,
        delegated_to_id: ownerId !== currentUser.id ? ownerId : undefined,
      }),
    onSuccess: ({ closed_task, new_task }) => {
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['task', task.id] })

      const undo = async () => {
        try {
          await updateTask(closed_task.id, { status: 'open', completed: false })
          await updateTask(new_task.id, { status: 'closed' })
          queryClient.invalidateQueries({ queryKey: ['dashboard'] })
          queryClient.invalidateQueries({ queryKey: ['tasks'] })
          showToast('Undone')
        } catch (e) {
          showToast('Could not undo', 'error')
        }
      }

      showToast('Task closed. Follow-up created.', 'success', undo)
      onSuccess(new_task)
      onClose()
    },
    onError: (e: Error) => showToast(e.message, 'error'),
  })

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div className="bg-surface border border-border rounded-lg w-full max-w-sm mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-border">
          <h3 className="font-semibold text-text-primary">Close & Follow Up</h3>
          <p className="text-xs text-text-secondary mt-1">This task will be marked complete. A new linked task will be created.</p>
        </div>

        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="block text-xs text-text-secondary mb-1">New task title</label>
            <textarea
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              rows={2}
              className="w-full text-sm resize-none"
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
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-border">
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!title.trim() || mutation.isPending}
            className="btn-secondary disabled:opacity-40"
          >
            {mutation.isPending ? 'Creating...' : 'Create Follow-Up'}
          </button>
        </div>
      </div>
    </div>
  )
}
