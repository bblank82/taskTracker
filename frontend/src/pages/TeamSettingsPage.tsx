import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getUsers, createUser, deleteUser, getUserOpenTasks } from '../api/users'
import { bulkUpdate } from '../api/tasks'
import { useAuthStore } from '../store/authStore'
import { useToast } from '../components/Toast'
import type { User } from '../types'

interface OpenTask {
  id: number
  title: string
  project_name: string
}

function RemoveMemberModal({
  member,
  openTasks,
  users,
  currentUser,
  onClose,
  onRemoved,
}: {
  member: User
  openTasks: OpenTask[]
  users: User[]
  currentUser: User
  onClose: () => void
  onRemoved: () => void
}) {
  const [bulkAssignTo, setBulkAssignTo] = useState('')
  const [taskAssignments, setTaskAssignments] = useState<Record<number, string>>({})
  const { showToast } = useToast()
  const queryClient = useQueryClient()

  const allAssigned = openTasks.every(
    (t) => bulkAssignTo !== '' || taskAssignments[t.id] !== undefined
  )

  const removeMutation = useMutation({
    mutationFn: async () => {
      if (openTasks.length > 0) {
        if (bulkAssignTo) {
          await bulkUpdate(openTasks.map((t) => t.id), { owner_id: Number(bulkAssignTo) })
        } else {
          const updates = Object.entries(taskAssignments)
          await Promise.all(updates.map(([tid, uid]) => bulkUpdate([Number(tid)], { owner_id: Number(uid) })))
        }
      }
      await deleteUser(member.id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      showToast(`${member.name} removed from team`)
      onRemoved()
    },
    onError: (e: Error) => showToast(e.message, 'error'),
  })

  const otherUsers = users.filter((u) => u.id !== member.id && u.id !== currentUser.id)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-surface border border-border rounded-lg w-full max-w-md mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-border">
          <h3 className="font-semibold text-text-primary">Remove {member.name}</h3>
        </div>

        <div className="px-5 py-4">
          {openTasks.length === 0 ? (
            <p className="text-sm text-text-secondary">No open tasks. Ready to remove.</p>
          ) : (
            <>
              <p className="text-sm text-text-secondary mb-3">
                {member.name} has {openTasks.length} open task{openTasks.length !== 1 ? 's' : ''}. Reassign before removing.
              </p>
              <div className="mb-3">
                <label className="block text-xs text-text-muted mb-1">Reassign all to:</label>
                <select value={bulkAssignTo} onChange={(e) => setBulkAssignTo(e.target.value)} className="w-full text-sm">
                  <option value="">Reassign individually below...</option>
                  {otherUsers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
              {!bulkAssignTo && (
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {openTasks.map((t) => (
                    <div key={t.id} className="flex items-center gap-2 text-xs">
                      <span className="flex-1 truncate text-text-secondary">{t.title}</span>
                      <select
                        value={taskAssignments[t.id] ?? ''}
                        onChange={(e) => setTaskAssignments((prev) => ({ ...prev, [t.id]: e.target.value }))}
                        className="text-xs py-0.5"
                      >
                        <option value="">Assign to...</option>
                        {otherUsers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex justify-between items-center px-5 py-4 border-t border-border">
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button
            onClick={() => removeMutation.mutate()}
            disabled={(openTasks.length > 0 && !allAssigned && !bulkAssignTo) || removeMutation.isPending}
            className="px-4 py-2 rounded-md text-sm font-medium bg-red-900 text-red-100 hover:bg-red-800 transition-colors disabled:opacity-40"
          >
            {removeMutation.isPending ? 'Removing...' : `Remove ${member.name}`}
          </button>
        </div>
      </div>
    </div>
  )
}

export function TeamSettingsPage() {
  const navigate = useNavigate()
  const { currentUser } = useAuthStore()
  const { showToast } = useToast()
  const queryClient = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [removingMember, setRemovingMember] = useState<User | null>(null)
  const [removeMemberTasks, setRemoveMemberTasks] = useState<OpenTask[]>([])
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newRole, setNewRole] = useState('member')

  const { data: users = [] } = useQuery({ queryKey: ['users'], queryFn: getUsers })

  const addMutation = useMutation({
    mutationFn: () => createUser({ name: newName.trim(), email: newEmail.trim(), role: newRole }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      showToast(`${newName} added to team`)
      setNewName('')
      setNewEmail('')
      setNewRole('member')
      setShowAdd(false)
    },
    onError: (e: Error) => showToast(e.message, 'error'),
  })

  const handleRemoveClick = async (member: User) => {
    try {
      const tasks = await getUserOpenTasks(member.id) as OpenTask[]
      setRemoveMemberTasks(tasks)
      setRemovingMember(member)
    } catch (e) {
      showToast('Failed to fetch member tasks', 'error')
    }
  }

  if (!currentUser) {
    navigate('/login')
    return null
  }

  return (
    <div className="min-h-screen bg-base">
      <header className="sticky top-0 z-30 flex items-center gap-3 px-4 py-2.5 bg-base border-b border-border">
        <button onClick={() => navigate('/')} className="text-text-muted hover:text-text-primary text-sm">← Dashboard</button>
        <span className="font-bold text-text-primary">◈ TaskFlow</span>
        <span className="text-text-muted text-sm">/ Team</span>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-lg font-semibold text-text-primary">Team Members</h1>
          <button onClick={() => setShowAdd((s) => !s)} className="btn-primary text-sm">+ Add Member</button>
        </div>

        {showAdd && (
          <div className="card p-4 mb-6">
            <h3 className="text-sm font-medium text-text-primary mb-3">New Team Member</h3>
            <div className="grid grid-cols-3 gap-3 mb-3">
              <input
                placeholder="Name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="text-sm"
              />
              <input
                placeholder="Email"
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="text-sm"
              />
              <select value={newRole} onChange={(e) => setNewRole(e.target.value)} className="text-sm">
                <option value="member">Member</option>
                <option value="lead">Lead</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => addMutation.mutate()}
                disabled={!newName.trim() || !newEmail.trim() || addMutation.isPending}
                className="btn-primary text-sm disabled:opacity-40"
              >
                {addMutation.isPending ? 'Adding...' : 'Add Member'}
              </button>
              <button onClick={() => setShowAdd(false)} className="btn-ghost text-sm">Cancel</button>
            </div>
          </div>
        )}

        <div className="card overflow-hidden">
          <div className="grid grid-cols-[1fr_1.5fr_6rem_5rem] gap-4 px-4 py-2 border-b border-border text-xs text-text-muted uppercase tracking-wide">
            <span>Name</span>
            <span>Email</span>
            <span>Role</span>
            <span></span>
          </div>

          {users.map((user) => (
            <div key={user.id} className="grid grid-cols-[1fr_1.5fr_6rem_5rem] gap-4 px-4 py-3 border-b border-border last:border-0 items-center">
              <div>
                <div className="text-sm text-text-primary font-medium">
                  {user.name}
                  {user.id === currentUser.id && <span className="text-text-muted text-xs ml-1">★ you</span>}
                </div>
              </div>
              <div className="text-xs text-text-secondary truncate">{user.email}</div>
              <div className="text-xs text-text-muted capitalize">{user.role}</div>
              <div className="flex justify-end">
                {user.id !== currentUser.id && (
                  <button
                    onClick={() => handleRemoveClick(user)}
                    className="text-xs text-text-muted hover:text-red-400 transition-colors"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {removingMember && (
        <RemoveMemberModal
          member={removingMember}
          openTasks={removeMemberTasks}
          users={users}
          currentUser={currentUser}
          onClose={() => setRemovingMember(null)}
          onRemoved={() => setRemovingMember(null)}
        />
      )}
    </div>
  )
}
