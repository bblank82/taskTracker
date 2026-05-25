import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { bulkUpdate } from '../api/tasks'
import { useToast } from './Toast'
import type { User } from '../types'

interface BulkActionBarProps {
  selectedIds: number[]
  users: User[]
  onCancel: () => void
}

export function BulkActionBar({ selectedIds, users, onCancel }: BulkActionBarProps) {
  const [assignTo, setAssignTo] = useState('')
  const [followUpDate, setFollowUpDate] = useState('')
  const { showToast } = useToast()
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async () => {
      const data: Parameters<typeof bulkUpdate>[1] = {}
      if (assignTo) data.owner_id = Number(assignTo)
      if (followUpDate) data.follow_up_date = followUpDate
      await bulkUpdate(selectedIds, data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      showToast(`${selectedIds.length} tasks updated`)
      onCancel()
    },
    onError: (e: Error) => showToast(e.message, 'error'),
  })

  return (
    <div className="sticky top-[5.5rem] z-10 bg-elevated border-y border-accent/40 px-4 py-2 flex items-center gap-3 text-sm">
      <span className="text-accent font-medium">{selectedIds.length} selected</span>

      <select
        value={assignTo}
        onChange={(e) => setAssignTo(e.target.value)}
        className="py-1 pl-2 pr-6 text-sm"
      >
        <option value="">Reassign to...</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>{u.name}</option>
        ))}
      </select>

      <input
        type="date"
        value={followUpDate}
        onChange={(e) => setFollowUpDate(e.target.value)}
        className="py-1 px-2 text-sm"
      />

      <button
        onClick={() => mutation.mutate()}
        disabled={(!assignTo && !followUpDate) || mutation.isPending}
        className="btn-primary disabled:opacity-40"
      >
        {mutation.isPending ? 'Updating...' : 'Apply'}
      </button>

      <button onClick={onCancel} className="btn-ghost">Cancel</button>
    </div>
  )
}
