import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { getUsers, login } from '../api/session'
import { useAuthStore } from '../store/authStore'
import type { User } from '../types'

export function LoginPage() {
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const navigate = useNavigate()
  const { setUser, currentUser } = useAuthStore()

  useEffect(() => {
    if (currentUser) navigate('/')
  }, [currentUser, navigate])

  const { data: users = [], isLoading, error } = useQuery({
    queryKey: ['users-public'],
    queryFn: getUsers,
  })

  const loginMutation = useMutation({
    mutationFn: (userId: number) => login(userId),
    onSuccess: ({ user }) => {
      setUser(user)
      navigate('/')
    },
  })

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-base">
        <span className="text-text-muted">Loading...</span>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-base">
      <div className="card w-full max-w-sm p-8 shadow-2xl">
        <div className="text-center mb-8">
          <div className="text-3xl font-bold text-text-primary mb-1">◈ TaskFlow</div>
          <p className="text-text-muted text-sm">Team Task Tracker</p>
        </div>

        {error && (
          <div className="mb-4 text-sm text-red-400 bg-red-950 border border-red-800 rounded px-3 py-2">
            Could not connect to server. Make sure the backend is running.
          </div>
        )}

        <div className="mb-6">
          <label className="block text-xs text-text-secondary mb-2">Who are you?</label>
          <div className="space-y-1">
            {users.map((user) => (
              <button
                key={user.id}
                onClick={() => setSelectedUser(user)}
                className={`w-full text-left px-3 py-2.5 rounded-md text-sm transition-colors
                  ${selectedUser?.id === user.id
                    ? 'bg-accent text-white'
                    : 'bg-elevated text-text-primary hover:bg-border'}`}
              >
                <div className="font-medium">{user.name}</div>
                <div className={`text-xs ${selectedUser?.id === user.id ? 'text-indigo-200' : 'text-text-muted'}`}>
                  {user.role}
                </div>
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={() => selectedUser && loginMutation.mutate(selectedUser.id)}
          disabled={!selectedUser || loginMutation.isPending}
          className="w-full btn-primary py-2.5 disabled:opacity-40"
        >
          {loginMutation.isPending ? 'Signing in...' : 'Continue →'}
        </button>

        <div className="mt-4 text-center">
          <a href="/settings/team" className="text-xs text-text-muted hover:text-accent transition-colors">
            + Add team member
          </a>
        </div>
      </div>
    </div>
  )
}
