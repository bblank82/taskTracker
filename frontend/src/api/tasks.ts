import { apiDelete, apiGet, apiPatch, apiPost } from './client'
import type { Task, ChainItem } from '../types'

export interface TaskFilters {
  theme_id?: number
  owner_id?: number
  delegated_to_id?: number
  mine?: boolean
  status?: string
  due?: string
  upcoming_days?: number
  completed?: boolean
}

export const getTasks = (filters?: TaskFilters) =>
  apiGet<Task[]>('/api/tasks', filters as Record<string, string | number | boolean | undefined>)

export const getTask = (id: number) => apiGet<Task>(`/api/tasks/${id}`)

export const createTask = (data: {
  theme_id: number
  title: string
  description?: string
  follow_up_date?: string
  delegated_to_id?: number
}) => apiPost<Task>('/api/tasks', data)

export const updateTask = (id: number, data: Partial<{
  title: string
  description: string
  follow_up_date: string
  owner_id: number
  delegated_to_id: number | null
  completed: boolean
  status: string
  theme_id: number
  deferred_until: string | null
}>) => apiPatch<Task>(`/api/tasks/${id}`, data)

export const deleteTask = (id: number) => apiDelete<{ ok: boolean }>(`/api/tasks/${id}`)

export const closeAndFollowUp = (id: number, data: {
  title: string
  follow_up_date?: string
  description?: string
  delegated_to_id?: number
}) => apiPost<{ closed_task: Task; new_task: Task }>(`/api/tasks/${id}/close-and-follow-up`, data)

export const getTaskChain = (id: number) =>
  apiGet<{ chain: ChainItem[]; current_task_id: number }>(`/api/tasks/${id}/chain`)

export const bulkUpdate = async (ids: number[], data: Partial<{ owner_id: number; delegated_to_id: number; follow_up_date: string }>) => {
  return Promise.all(ids.map(id => updateTask(id, data)))
}
