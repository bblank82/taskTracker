import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createProject } from '../api/themes'
import { useToast } from './Toast'
import { useFilterStore } from '../store/filterStore'

interface AddProjectModalProps {
  onClose: () => void
}

export function AddProjectModal({ onClose }: AddProjectModalProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const { showToast } = useToast()
  const queryClient = useQueryClient()
  const { expandedProjects, setExpandedProjects } = useFilterStore()

  const mutation = useMutation({
    mutationFn: () => createProject({ name: name.trim(), description: description.trim() || undefined }),
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      setExpandedProjects([...expandedProjects, project.id])
      showToast(`Project "${name}" created`)
      onClose()
    },
    onError: (e: Error) => showToast(e.message, 'error'),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-surface border border-border rounded-lg w-full max-w-sm mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-text-primary">New Project</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">✕</button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="block text-xs text-text-secondary mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Q3 Launch, Client: Acme, Hiring"
              className="w-full text-sm"
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) mutation.mutate() }}
            />
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1">Description (optional)</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description"
              className="w-full text-sm"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-border">
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!name.trim() || mutation.isPending}
            className="btn-primary disabled:opacity-40"
          >
            {mutation.isPending ? 'Creating...' : 'Create Project'}
          </button>
        </div>
      </div>
    </div>
  )
}
