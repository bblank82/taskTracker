import { apiDelete, apiGet, apiPatch, apiPost } from './client'
import type { User } from '../types'

export const getUsers = () => apiGet<User[]>('/api/users')
export const getUser = (id: number) => apiGet<User>(`/api/users/${id}`)
export const createUser = (data: { name: string; email: string; role: string }) =>
  apiPost<User>('/api/users', data)
export const updateUser = (id: number, data: Partial<{ name: string; email: string; role: string; is_active: boolean }>) =>
  apiPatch<User>(`/api/users/${id}`, data)
export const deleteUser = (id: number) => apiDelete<{ ok: boolean }>(`/api/users/${id}`)
export const getUserOpenTasks = (id: number) => apiGet<unknown[]>(`/api/users/${id}/tasks`)
