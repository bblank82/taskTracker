import { apiDelete, apiGet, apiPost } from './client'
import type { User } from '../types'

export const getUsers = () => apiGet<User[]>('/api/users')
export const login = (user_id: number) => apiPost<{ user: User }>('/api/session', { user_id })
export const logout = () => apiDelete<{ ok: boolean }>('/api/session')
export const getSession = () => apiGet<{ user: User }>('/api/session')
